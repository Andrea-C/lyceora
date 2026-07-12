/**
 * Fills math-junior.json's `it` fields with genuine Italian translations,
 * replacing the English copies Task 12's import left behind (root
 * `itPending: true`), via the @lyceora/agents model registry (strong tier,
 * role "teacher"). Removes `itPending` on completion so translation-lint.test.ts
 * flips from skipped to enforcing.
 *
 * Resumable: after every topic, progress (the set of done topic ids) is
 * checkpointed to data/.translate-progress.json (git-ignored) and the data
 * file itself is re-written, so an interrupted run can simply be restarted
 * and will skip ids already marked done.
 *
 * --dry-run: verifies the script's mechanics without any API key. Skips the
 * model registry entirely, translates 2 NEW topics per invocation with a
 * deterministic stub translator (prefixes "IT: " to the English text), and
 * writes to a TEMP copy of the data/progress files in a stable OS-temp
 * directory — the real math-junior.json is never touched. Because the temp
 * copy and its progress file persist across invocations (only seeded from
 * the real file once), running `--dry-run` repeatedly demonstrates the same
 * resume-by-skipping-done-ids mechanics the real run relies on.
 *
 * Run: pnpm --filter @lyceora/taxonomy run translate:junior
 *      pnpm --filter @lyceora/taxonomy run translate:junior -- --dry-run
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { generateObject } from "ai";
import { loadModelsConfig, createRegistry } from "@lyceora/agents";

const p = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const dryRun = process.argv.includes("--dry-run");

const realFile = p("../data/math-junior.json");
const realProgressFile = p("../data/.translate-progress.json");

// --dry-run: work on a scratch copy so the committed data can never be touched.
const dryRunDir = join(tmpdir(), "lyceora-translate-dry-run");
if (dryRun) mkdirSync(dryRunDir, { recursive: true });
const [file, progressFile] = dryRun
  ? [join(dryRunDir, "math-junior.json"), join(dryRunDir, ".translate-progress.json")]
  : [realFile, realProgressFile];
if (dryRun && !existsSync(file)) writeFileSync(file, readFileSync(realFile, "utf-8"));

const data = JSON.parse(readFileSync(file, "utf-8"));
const done = new Set<string>(existsSync(progressFile) ? JSON.parse(readFileSync(progressFile, "utf-8")) : []);

type JuniorTopic = { id: string; name: { it: string; en: string }; description: { it: string; en: string }; evidence: { it: string; en: string }[] };

const outSchema = z.object({ name_it: z.string().min(1), description_it: z.string().min(1), evidence_it: z.array(z.string().min(1)) });

const BATCH_PROMPT = (t: JuniorTopic) => [
  "Translate this math-topic record into Italian for an Italian middle/primary-school context.",
  "Rules: natural school Italian (not literal), comma as decimal separator in numeric examples,",
  "warm non-judgmental register, keep mathematical terms in standard Italian usage.",
  `Name: ${t.name.en}`, `Description: ${t.description.en}`,
  `Evidence criteria (translate each, same order): ${t.evidence.map((e) => e.en).join(" | ")}`
].join("\n");

// Deterministic stand-in for --dry-run: no network call, no API key needed.
const stubTranslate = (t: JuniorTopic) => ({
  name_it: `IT: ${t.name.en}`,
  description_it: `IT: ${t.description.en}`,
  evidence_it: t.evidence.map((e) => `IT: ${e.en}`)
});

const registry = dryRun
  ? undefined
  : createRegistry(loadModelsConfig(readFileSync(p("../../agents/config/models.yaml"), "utf-8")));

// --dry-run caps how many NEW topics one invocation translates (already-done
// ids are still skipped without counting against the cap), so repeated
// invocations advance the frontier and prove resumability.
const budget = dryRun ? 2 : Infinity;
let translatedThisRun = 0;

for (const t of data.topics as JuniorTopic[]) {
  if (translatedThisRun >= budget) break;
  if (done.has(t.id)) continue;
  const translated = dryRun
    ? stubTranslate(t)
    : await registry!.withFallback("teacher", async ({ model }) => {
        const { object } = await generateObject({ model, schema: outSchema, prompt: BATCH_PROMPT(t) });
        if (object.evidence_it.length !== t.evidence.length) throw new Error(`evidence count mismatch for ${t.id}`);
        return object;
      });
  t.name.it = translated.name_it;
  t.description.it = translated.description_it;
  t.evidence.forEach((ev, i) => { ev.it = translated.evidence_it[i]!; });
  done.add(t.id);
  translatedThisRun++;
  writeFileSync(progressFile, JSON.stringify([...done]));
  writeFileSync(file, JSON.stringify(data, null, 2)); // save-as-you-go: resumable
  console.log(`${done.size}/${data.topics.length} ${t.id}`);
}

if (!dryRun) delete data.itPending;
writeFileSync(file, JSON.stringify(data, null, 2));
console.log(dryRun ? `dry-run complete: ${file}` : "overlay complete");
