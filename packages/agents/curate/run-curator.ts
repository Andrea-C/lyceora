/**
 * Curator CLI: finds candidate learning resources (videos / exercises / assessments) for one
 * topic or the whole merged taxonomy (math-core + math-junior + math-it-media), vets them for
 * liveness and kid-safety, and writes a review file for a human to approve via promote.ts.
 *
 * Live mode calls the Anthropic API directly with the `web_search` provider tool (search),
 * `fetch` (liveness), and a `generateObject` judge on the registry's standard tier — real money,
 * capped by --budget. Set LYCEORA_FAKE_MODELS=1 to run the whole pipeline against
 * createFakeCuratorPorts() instead (no key, no network, deterministic — used by the CI-safe
 * smoke test in test/curator-cli.test.ts).
 *
 * Resumable: after every topic, progress is checkpointed to
 * packages/taxonomy/data/.curator-progress.json (git-ignored) keyed by topic id, so a run
 * interrupted by the budget cap (or anything else) can simply be restarted.
 *
 * Usage: pnpm --filter @lyceora/agents run curate -- --topic <id> [--budget 3] [--max-searches-per-topic 3] [--locale it]
 *        pnpm --filter @lyceora/agents run curate -- --all [--budget 3]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateText, generateObject, type LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { resourceSchema, type CuratedResource, type Topic } from "@lyceora/taxonomy";
import {
  loadModelsConfig, createRegistry, splitRef, type Registry, type ModelsConfig,
  curateTopic, createBudget, createFakeCuratorPorts, KID_SAFETY_GUARDRAILS,
  type CuratorSearchPort, type CuratorJudgePort, type CuratorLivenessPort, type Budget
} from "../src/index";

type Ports = { search: CuratorSearchPort["search"]; judge: CuratorJudgePort["judge"]; alive: CuratorLivenessPort["alive"] };
type Locale = "it" | "en";

export interface RunCuratorOverrides {
  /** Injected ports (tests). Bypasses both LYCEORA_FAKE_MODELS and any live API setup. */
  ports?: Ports;
  /** Root of the taxonomy data dir (default: packages/taxonomy/data). */
  dataDir?: string;
  /** Where proposals files are written (default: <dataDir>/curated-review). */
  outDir?: string;
  /** Progress checkpoint file (default: <dataDir>/.curator-progress.json). */
  progressFile?: string;
}

export interface RunCuratorResult {
  proposalsPath: string | null;
  proposals: (CuratedResource & { validationNotes: string })[];
  budgetSpentUsd: number;
  stoppedForBudget: boolean;
}

interface CliArgs {
  topic?: string;
  all: boolean;
  budget: number;
  maxSearchesPerTopic: number;
  locale: Locale;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { all: false, budget: 3, maxSearchesPerTopic: 3, locale: "it" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--topic":
        args.topic = argv[++i];
        break;
      case "--all":
        args.all = true;
        break;
      case "--budget": {
        const v = Number(argv[++i]);
        if (!Number.isFinite(v) || v <= 0) throw new Error("--budget must be a positive number");
        args.budget = v;
        break;
      }
      case "--max-searches-per-topic": {
        const v = Number(argv[++i]);
        if (!Number.isInteger(v) || v <= 0) throw new Error("--max-searches-per-topic must be a positive integer");
        args.maxSearchesPerTopic = v;
        break;
      }
      case "--locale": {
        const l = argv[++i];
        if (l !== "it" && l !== "en") throw new Error(`--locale must be "it" or "en", got "${l}"`);
        args.locale = l;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${a}`);
    }
  }
  if (!args.all && !args.topic) throw new Error("Provide --topic <id> or --all");
  if (args.all && args.topic) throw new Error("Use either --topic <id> or --all, not both");
  return args;
}

function loadMergedTopics(dataDir: string): Topic[] {
  const files = ["math-core.json", "math-junior.json", join("math-it-media", "topics.json")];
  const topics: Topic[] = [];
  for (const f of files) {
    const raw = JSON.parse(readFileSync(join(dataDir, f), "utf-8")) as { topics: Topic[] };
    topics.push(...raw.topics);
  }
  return topics;
}

function loadExistingUrls(dataDir: string): Set<string> {
  const raw = JSON.parse(readFileSync(join(dataDir, "math-it-media", "resources.json"), "utf-8")) as {
    resources: { url: string }[];
  };
  return new Set(raw.resources.map((r) => r.url));
}

function loadBlocklist(dataDir: string): string[] {
  const raw = JSON.parse(readFileSync(join(dataDir, "curator-blocklist.json"), "utf-8")) as { blocked: string[] };
  return raw.blocked;
}

type Progress = Record<string, { done: true; count: number; at: string }>;

function loadProgress(file: string): Progress {
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf-8")) as Progress) : {};
}

function saveProgress(file: string, progress: Progress): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(progress, null, 2));
}

// ---- live ports: web_search (Anthropic provider tool), fetch liveness, generateObject judge ----

const candidateSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  snippet: z.string().optional()
});

function searchPrompt(query: string): string {
  return [
    `Search the web for: ${query}`,
    "You are helping curate real, working links to free online math learning resources (a video, a printable/interactive exercise sheet, or a self-check assessment) suitable for a middle-school student.",
    "After searching, reply with ONLY a fenced ```json code block containing a JSON array of up to 5 candidates — no other prose.",
    'Each candidate: {"url": "https://...", "title": "...", "snippet": "..."}.',
    "Only include candidates backed by an actual search result — never invent a URL."
  ].join("\n");
}

function extractJsonArray(text: string): string | null {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1];
  const start = text.indexOf("[");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "[") depth++;
    else if (text[i] === "]") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseCandidates(text: string): { url: string; title: string; snippet: string }[] {
  const raw = extractJsonArray(text);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: { url: string; title: string; snippet: string }[] = [];
    for (const item of parsed) {
      const r = candidateSchema.safeParse(item);
      if (r.success && /^https?:\/\//.test(r.data.url)) {
        out.push({ url: r.data.url, title: r.data.title ?? "", snippet: r.data.snippet ?? "" });
      }
    }
    return out;
  } catch {
    return [];
  }
}

const judgeSchema = z.object({
  keep: z.boolean(),
  kind: z.enum(["video", "exercises", "assessment"]),
  lang: z.enum(["it", "en"]),
  title: z.object({ it: z.string().min(1), en: z.string().min(1) }),
  provider: z.string().min(1),
  reason: z.string().min(1)
});

function judgePrompt(topic: Topic, candidate: { url: string; title: string; snippet: string }, locale: Locale): string {
  return [
    "You are vetting a candidate online resource for inclusion in a curated math-learning library for children.",
    KID_SAFETY_GUARDRAILS,
    `Topic (ages ${topic.ageRangeStart}-${topic.ageRangeEnd}): ${topic.name.it} / ${topic.name.en}`,
    `Mastery evidence this resource should support: ${topic.evidence.map((e) => e[locale]).join("; ")}`,
    `Candidate — url: ${candidate.url}; title: "${candidate.title}"; snippet: "${candidate.snippet}"`,
    "Decide keep=true only if this is a real, safe, age-appropriate, on-topic math resource (a video, exercise sheet, or self-check assessment). Set keep=false for anything off-topic, unsafe, broken-sounding, or a low-quality content farm.",
    'Return kind ("video"|"exercises"|"assessment"), lang ("it"|"en"), a localized title {it, en}, the provider/publisher name, and a short reason for your verdict.'
  ].join("\n");
}

interface LiveState {
  budgetExhausted: boolean;
}

function anthropicSearchModel(config: ModelsConfig): { client: ReturnType<typeof createAnthropic>; model: LanguageModel } {
  const providerCfg = config.providers.anthropic;
  if (!providerCfg) throw new Error("models.yaml: curator web_search requires an 'anthropic' provider entry");
  const client = createAnthropic({ apiKey: process.env[providerCfg.api_key_env], baseURL: providerCfg.base_url });
  const strongRefs = config.tiers.strong ?? [];
  const ref = strongRefs.find((r) => splitRef(r).provider === "anthropic");
  if (!ref) throw new Error("models.yaml: curator web_search requires an anthropic ref in tiers.strong");
  return { client, model: client(splitRef(ref).modelId) };
}

function createLivePorts(deps: {
  client: ReturnType<typeof createAnthropic>;
  searchModel: LanguageModel;
  registry: Registry;
  maxUses: number;
  budget: Budget;
  blocklist: string[];
}): Ports & { state: LiveState } {
  const state: LiveState = { budgetExhausted: false };

  const search: CuratorSearchPort["search"] = async (query) => {
    if (state.budgetExhausted) return [];
    // The installed @ai-sdk/anthropic build pins an older @ai-sdk/provider-utils major than the
    // installed `ai` package does, so its Tool's branded Schema type doesn't nominally match what
    // generateText's `tools` param expects — a cross-package type-version mismatch only; the
    // runtime shape is the documented Anthropic provider-tool object, so this cast is safe.
    const tools = { web_search: deps.client.tools.webSearch_20250305({ maxUses: deps.maxUses }) } as Parameters<
      typeof generateText
    >[0]["tools"];
    const result = await generateText({
      model: deps.searchModel,
      tools,
      prompt: searchPrompt(query)
    });
    const searchesUsed = result.toolCalls?.filter((tc) => tc.toolName === "web_search").length ?? 0;
    const tokens = result.usage?.totalTokens ?? 0;
    const cost = 0.01 * searchesUsed + tokens * 0.000003;
    if (!deps.budget.spend(cost)) {
      state.budgetExhausted = true;
      return [];
    }
    return parseCandidates(result.text);
  };

  const alive: CuratorLivenessPort["alive"] = async (url) => {
    if (deps.blocklist.some((b) => url.includes(b))) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      let res = await fetch(url, { method: "HEAD", signal: controller.signal });
      if (res.status === 405) res = await fetch(url, { method: "GET", signal: controller.signal });
      return res.status < 400;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  };

  const judge: CuratorJudgePort["judge"] = async (topic, candidate, locale) =>
    deps.registry.withFallback("curator_judge", async ({ model }) => {
      const { object } = await generateObject({ model, schema: judgeSchema, prompt: judgePrompt(topic, candidate, locale) });
      return object;
    });

  return { search, alive, judge, state };
}

// ---------------------------------- CLI orchestration ----------------------------------

export async function runCurator(argv: string[], overrides: RunCuratorOverrides = {}): Promise<RunCuratorResult> {
  const args = parseArgs(argv);
  const dataDir = overrides.dataDir ?? fileURLToPath(new URL("../../taxonomy/data", import.meta.url));

  const allTopics = loadMergedTopics(dataDir);
  let topics: Topic[];
  if (args.all) {
    topics = allTopics;
  } else {
    const t = allTopics.find((x) => x.id === args.topic);
    if (!t) throw new Error(`Topic "${args.topic}" not found in merged topics (math-core + math-junior + math-it-media)`);
    topics = [t];
  }

  const existingUrls = loadExistingUrls(dataDir);
  const budget = createBudget(args.budget);
  const fakeModels = process.env.LYCEORA_FAKE_MODELS === "1";

  let ports: Ports;
  let isBudgetExhausted = (): boolean => false;
  if (overrides.ports) {
    ports = overrides.ports;
  } else if (fakeModels) {
    ports = createFakeCuratorPorts();
  } else {
    const yamlPath = fileURLToPath(new URL("../config/models.yaml", import.meta.url));
    const config = loadModelsConfig(readFileSync(yamlPath, "utf-8"));
    const registry = createRegistry(config);
    const { client, model } = anthropicSearchModel(config);
    const blocklist = loadBlocklist(dataDir);
    const live = createLivePorts({
      client, searchModel: model, registry, maxUses: args.maxSearchesPerTopic, budget, blocklist
    });
    ports = { search: live.search, judge: live.judge, alive: live.alive };
    isBudgetExhausted = () => live.state.budgetExhausted;
  }

  const progressFile = overrides.progressFile ?? join(dataDir, ".curator-progress.json");
  const progress = loadProgress(progressFile);

  const allProposals: (CuratedResource & { validationNotes: string })[] = [];
  let stoppedForBudget = false;
  let topicsProcessed = 0;

  for (const topic of topics) {
    if (progress[topic.id]?.done) continue;
    if (isBudgetExhausted()) {
      stoppedForBudget = true;
      break;
    }

    const results = await curateTopic(topic, ports, { existingUrls, maxSearches: args.maxSearchesPerTopic });
    for (const r of results) {
      resourceSchema.parse(r); // defensive re-validation before writing (r has no validationNotes yet)
      const validationNotes =
        `curated ${new Date().toISOString()} via run-curator.ts (topic ${topic.id}); ` +
        "verify safety, liveness and licence before promoting.";
      allProposals.push({ ...r, validationNotes });
      existingUrls.add(r.url);
    }
    progress[topic.id] = { done: true, count: results.length, at: new Date().toISOString() };
    saveProgress(progressFile, progress);
    topicsProcessed++;

    if (isBudgetExhausted()) {
      stoppedForBudget = true;
      break;
    }
  }

  let proposalsPath: string | null = null;
  if (allProposals.length > 0) {
    const outDir = overrides.outDir ?? join(dataDir, "curated-review");
    mkdirSync(outDir, { recursive: true });
    const dateStr = new Date().toISOString().slice(0, 10);
    proposalsPath = join(outDir, `${dateStr}-proposals.json`);
    writeFileSync(proposalsPath, JSON.stringify({ proposals: allProposals }, null, 2));
  }

  printSummary({
    topicsProcessed, totalTopics: topics.length, proposalsCount: allProposals.length,
    proposalsPath, budgetSpentUsd: budget.total(), budgetCapUsd: args.budget, stoppedForBudget
  });

  return { proposalsPath, proposals: allProposals, budgetSpentUsd: budget.total(), stoppedForBudget };
}

function printSummary(s: {
  topicsProcessed: number; totalTopics: number; proposalsCount: number; proposalsPath: string | null;
  budgetSpentUsd: number; budgetCapUsd: number; stoppedForBudget: boolean
}): void {
  console.log("");
  console.log(`Curator run: ${s.topicsProcessed}/${s.totalTopics} topic(s) processed, ${s.proposalsCount} proposal(s) found.`);
  console.log(
    `Budget: $${s.budgetSpentUsd.toFixed(4)} / $${s.budgetCapUsd.toFixed(2)}` +
    (s.stoppedForBudget ? " — STOPPED (budget exhausted)" : "")
  );
  console.log(s.proposalsPath ? `Proposals written to ${s.proposalsPath}` : "No proposals written.");
  console.log("");
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fileURLToPath(import.meta.url) === entry;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  runCurator(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
