/**
 * Manual eval harness for the assessor agent (exercise generation + grading) against a REAL
 * model provider. Not run in CI — packages/agents/test/* already covers the pure/deterministic
 * logic (gradeDeterministic, schema, registry wiring) without needing a network call or a key.
 * This script exercises the actual generateObject() calls (exercise generation + open-answer /
 * attribution grading) that only Task 17's Playwright suite otherwise exercises indirectly
 * through the fake assessor.
 *
 * Usage: `pnpm --filter @lyceora/agents evals` (needs at least one provider key from
 * config/models.yaml's providers set in the environment — see .env.example). With no key set,
 * this prints a SKIP message and exits 0, so it's safe to leave wired into scripts without
 * breaking CI or a keyless local checkout.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Locale, Topic } from "@lyceora/taxonomy";
import { loadModelsConfig, createRegistry, generateExercises, gradeAnswer, exerciseSetSchema, type Exercise } from "../src/index.js";

const PROVIDER_ENV_VARS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY"];

interface Row { name: string; pass: boolean; detail: string }

async function main(): Promise<void> {
  if (!PROVIDER_ENV_VARS.some((name) => (process.env[name] ?? "").trim().length > 0)) {
    console.log(
      `SKIP: no provider API key set (checked ${PROVIDER_ENV_VARS.join(", ")}).\n` +
      `This eval only runs manually against a real model — set one of those env vars ` +
      `(see .env.example) and re-run \`pnpm --filter @lyceora/agents evals\`.`
    );
    process.exit(0);
  }

  const yamlPath = fileURLToPath(new URL("../config/models.yaml", import.meta.url));
  const registry = createRegistry(loadModelsConfig(readFileSync(yamlPath, "utf-8")));

  const topicsPath = fileURLToPath(new URL("../../taxonomy/data/math-it-media/topics.json", import.meta.url));
  const { topics } = JSON.parse(readFileSync(topicsPath, "utf-8")) as { topics: Topic[] };

  const rows: Row[] = [];
  await runGenerationChecks(registry, topics, rows);
  await runGradingChecks(registry, rows);

  printTable(rows);
  process.exit(rows.some((r) => !r.pass) ? 1 : 0);
}

function findTopic(topics: Topic[], id: string): Topic {
  const t = topics.find((x) => x.id === id);
  if (!t) throw new Error(`Fixture topic "${id}" not found in math-it-media/topics.json`);
  return t;
}

const NON_ITALIAN_WORDS = /\b(the|and|which)\b/i;

async function runGenerationChecks(
  registry: ReturnType<typeof createRegistry>, topics: Topic[], rows: Row[]
): Promise<void> {
  // one fixture topic per difficulty band, spread across the recovery path's target topics
  const fixtures: { topicId: string; difficulty: 1 | 2 | 3 }[] = [
    { topicId: "lyc_potenze_def", difficulty: 1 },
    { topicId: "lyc_radici_espressioni", difficulty: 2 },
    { topicId: "lyc_pit_applicazioni_figure", difficulty: 3 }
  ];

  for (const { topicId, difficulty } of fixtures) {
    const name = `generate: ${topicId} @ difficulty ${difficulty}`;
    try {
      const topic = findTopic(topics, topicId);
      const exercises = await generateExercises(registry, topic, "it", { count: 3, difficulty });

      const parsed = exerciseSetSchema.safeParse({ exercises });
      if (!parsed.success) { rows.push({ name, pass: false, detail: `schema: ${parsed.error.message}` }); continue; }

      const nonItalian = exercises.find((e) => NON_ITALIAN_WORDS.test(e.prompt));
      if (nonItalian) { rows.push({ name, pass: false, detail: `looks non-Italian: "${nonItalian.prompt}"` }); continue; }

      const badMcq = exercises.find((e) => e.kind === "mcq" && !isValidMcqIndex(e.correctAnswer, e.choices));
      if (badMcq) { rows.push({ name, pass: false, detail: `mcq correctAnswer not a valid choice index: ${JSON.stringify(badMcq)}` }); continue; }

      const wrongDifficulty = exercises.find((e) => e.difficulty !== difficulty);
      if (wrongDifficulty) { rows.push({ name, pass: false, detail: `exercise difficulty ${wrongDifficulty.difficulty} !== requested ${difficulty}` }); continue; }

      rows.push({ name, pass: true, detail: `${exercises.length} exercises, kinds: ${exercises.map((e) => e.kind).join(", ")}` });
    } catch (err) {
      rows.push({ name, pass: false, detail: describeError(err) });
    }
  }
}

function isValidMcqIndex(correctAnswer: string, choices: string[] | undefined): boolean {
  if (!choices) return false;
  const i = Number(correctAnswer);
  return Number.isInteger(i) && i >= 0 && i < choices.length;
}

interface GradeFixture {
  name: string;
  exercise: Exercise;
  answer: string;
  candidateConcepts?: string[];
  /** Omitted for the open/attribution fixture — a real model's subjective judgment on an open
   * answer isn't something we can pin exactly; that fixture is checked structurally instead. */
  expectCorrect?: boolean;
}

function numericExercise(correctAnswer: string): Exercise {
  return {
    id: "eval-numeric", kind: "numeric", prompt: "3/2 in decimale?",
    correctAnswer, explanation: "3 diviso 2 fa 1,5.", difficulty: 1
  };
}
function mcqExercise(): Exercise {
  return {
    id: "eval-mcq", kind: "mcq", prompt: "2^3 = ?", choices: ["6", "8", "9"],
    correctAnswer: "1", explanation: "2 x 2 x 2 = 8.", difficulty: 1
  };
}

function buildGradeFixtures(): GradeFixture[] {
  return [
    // 3 known-good
    { name: "numeric correct (exact)", exercise: numericExercise("1.5"), answer: "1.5", expectCorrect: true },
    { name: "numeric correct (comma decimal 1,5)", exercise: numericExercise("1.5"), answer: "1,5", expectCorrect: true },
    { name: "mcq correct (choice index)", exercise: mcqExercise(), answer: "1", expectCorrect: true },
    // 3 known-bad
    { name: "numeric wrong", exercise: numericExercise("1.5"), answer: "2", expectCorrect: false },
    { name: "mcq wrong (choice index)", exercise: mcqExercise(), answer: "0", expectCorrect: false },
    {
      name: "open answer, wrong, with candidateConcepts attribution",
      exercise: {
        id: "eval-open", kind: "open", prompt: "Spiega perché la radice quadrata di un numero negativo non esiste nei numeri reali.",
        correctAnswer: "Perché nessun numero reale elevato al quadrato dà un risultato negativo.",
        explanation: "Il quadrato di ogni numero reale (positivo o negativo) è sempre >= 0.",
        difficulty: 2
      },
      answer: "Perché i numeri negativi non si possono elevare al quadrato.",
      candidateConcepts: ["lyc_radici_espressioni", "lyc_potenze_def"]
      // no expectCorrect: this is the "attribution" fixture, checked structurally below
    }
  ];
}

async function runGradingChecks(registry: ReturnType<typeof createRegistry>, rows: Row[]): Promise<void> {
  for (const fx of buildGradeFixtures()) {
    const name = `grade: ${fx.name}`;
    try {
      const locale: Locale = "it";
      const result = await gradeAnswer(registry, fx.exercise, fx.answer, locale, { candidateConcepts: fx.candidateConcepts });

      if (fx.expectCorrect !== undefined) {
        const pass = result.correct === fx.expectCorrect && result.feedback.length > 0;
        rows.push({ name, pass, detail: `correct=${result.correct} (expected ${fx.expectCorrect}), feedback="${truncate(result.feedback)}"` });
        continue;
      }

      // attribution fixture: no fixed "right" verdict from an open-ended model judgment — assert
      // the structural guarantee instead (gradeAnswer's own contract: never attribute outside the
      // offered candidate set) and print what the model actually decided for manual review.
      const allowed = new Set(fx.candidateConcepts ?? []);
      const pass = result.feedback.length > 0 && result.failedConcepts.every((c) => allowed.has(c));
      rows.push({
        name, pass,
        detail: `correct=${result.correct}, failedConcepts=${JSON.stringify(result.failedConcepts)} (subset of candidates: ${pass}) — review manually`
      });
    } catch (err) {
      rows.push({ name, pass: false, detail: describeError(err) });
    }
  }
}

function truncate(s: string, n = 80): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function printTable(rows: Row[]): void {
  const nameWidth = Math.max(...rows.map((r) => r.name.length), "CHECK".length);
  const line = (s: string) => console.log(s);

  line("");
  line(`${"CHECK".padEnd(nameWidth)}  STATUS  DETAIL`);
  line("-".repeat(nameWidth + 10 + 60));
  for (const r of rows) {
    line(`${r.name.padEnd(nameWidth)}  ${r.pass ? "PASS  " : "FAIL  "}  ${r.detail}`);
  }
  const passed = rows.filter((r) => r.pass).length;
  line("-".repeat(nameWidth + 10 + 60));
  line(`${passed}/${rows.length} checks passed`);
  line("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
