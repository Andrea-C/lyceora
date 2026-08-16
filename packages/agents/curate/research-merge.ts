/**
 * Computes topic-level resource gaps (for prompting a web-researcher subagent) and merges that
 * subagent's researched JSON output into a human-review proposals file compatible with promote.ts.
 *
 * Two modes:
 *  --gaps   Scans math-it-media's topics/paths/resources and reports, per topic, which of the
 *           three resource kinds (video/exercises/assessment) have no attached resource yet.
 *           --json prints the full gap array (paste-ready for a subagent prompt); the default is
 *           a human-readable priority summary. A separate orchestrator loop is expected to run a
 *           Claude Code "web-researcher" subagent once per gap topic and save its JSON reply to an
 *           inbox dir.
 *  --merge  Reads every *.json file in --in <dir> (one file per researched topic: { topicId,
 *           proposals, notes? }), validates each proposal, vets URLs (scheme, blocklist,
 *           duplicate-of-existing, in-batch duplicate, unknown topicId, login wall, and — unless
 *           --no-liveness — a liveness fetch), and appends the survivors to
 *           packages/taxonomy/data/curated-review/<date>-proposals.json.
 *
 * Resumable/dedup: inbox files are one-per-topic, so re-running --merge over the same inbox dir
 * (or a dir with new files added since the last run) is safe — proposals are deduped by id
 * (res_<topicId>_<hash>, deterministic from topicId+url) both against ids already written to the
 * dated output file and against each other within the same run, so a repeated merge for the same
 * date never produces duplicate entries. A malformed inbox file is reported and skipped rather
 * than aborting the whole merge.
 *
 * Usage: pnpm --filter @lyceora/agents run research -- --gaps [--json]
 *        pnpm --filter @lyceora/agents run research -- --merge --in <dir> [--no-liveness] [--date YYYY-MM-DD]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { resourceSchema, topicSchema, type CuratedResource, type Topic, type LocalizedText } from "@lyceora/taxonomy";
import { resourceIdFor } from "../src/curator";

export type Kind = "video" | "exercises" | "assessment";
const ALL_KINDS: Kind[] = ["video", "exercises", "assessment"];

export interface TopicGap {
  topicId: string;
  name: LocalizedText;
  description: LocalizedText;
  evidence: LocalizedText[];
  ageRangeStart: number;
  ageRangeEnd: number;
  missing: Kind[];
  existingUrls: string[];
  priority: 1 | 2 | 3;
}

const researchProposalSchema = z.object({
  topicIds: z.array(z.string().min(1)).min(1),
  kind: z.enum(["video", "exercises", "assessment"]),
  provider: z.string().min(1),
  title: z.object({ it: z.string().min(1), en: z.string().min(1) }),
  url: z.string().url(),
  lang: z.enum(["it", "en"]),
  summary: z.object({ it: z.string().min(1), en: z.string().min(1) }),
  evidenceFit: z.string().min(1),
  checks: z.object({ fetched: z.boolean(), loginWall: z.boolean() })
});
export type ResearchProposal = z.infer<typeof researchProposalSchema>;

const inboxFileSchema = z.object({
  topicId: z.string().min(1),
  proposals: z.array(researchProposalSchema),
  notes: z.string().optional()
});

const topicsFileSchema = z.object({ topics: z.array(z.unknown()) });
const resourcesFileSchema = z.object({ resources: z.array(z.unknown()) });
const blocklistFileSchema = z.object({ blocked: z.array(z.string()) });
const pathsFileSchema = z.object({
  paths: z.array(z.object({ id: z.string().min(1), targetTopicIds: z.array(z.string()) }))
});

interface ProposalsFile {
  proposals: (CuratedResource & { validationNotes: string })[];
}

export interface ResearchMergeOverrides {
  topicsPath?: string;
  pathsPath?: string;
  resourcesPath?: string;
  blocklistPath?: string;
  reviewDir?: string;
  /** Injected "current date" (tests must not depend on `new Date()`). Defaults to real current date. */
  today?: string;
  /** Injected liveness check (tests). Bypasses the real fetch-based check. */
  liveness?: (url: string) => Promise<boolean>;
}

export interface ResearchMergeResult {
  mode: "gaps" | "merge";
  accepted: string[];
  rejected: { url: string; reason: string }[];
  rejectedFiles: { file: string; reason: string }[];
  outPath?: string;
  gaps?: TopicGap[];
}

type CliArgs = { mode: "gaps"; json: boolean } | { mode: "merge"; in: string; noLiveness: boolean; date?: string };

function parseArgs(argv: string[]): CliArgs {
  let mode: "gaps" | "merge" | undefined;
  let json = false;
  let inDir: string | undefined;
  let noLiveness = false;
  let date: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--gaps":
        mode = "gaps";
        break;
      case "--merge":
        mode = "merge";
        break;
      case "--json":
        json = true;
        break;
      case "--in":
        inDir = argv[++i];
        break;
      case "--no-liveness":
        noLiveness = true;
        break;
      case "--date": {
        const d = argv[++i];
        if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`--date must be YYYY-MM-DD, got "${d}"`);
        date = d;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${a}`);
    }
  }
  if (!mode) throw new Error("Provide --gaps or --merge");
  if (mode === "gaps") {
    if (inDir) throw new Error("--in is only valid with --merge");
    if (noLiveness) throw new Error("--no-liveness is only valid with --merge");
    if (date) throw new Error("--date is only valid with --merge");
    return { mode: "gaps", json };
  }
  if (json) throw new Error("--json is only valid with --gaps");
  if (!inDir) throw new Error("Provide --in <dir> with --merge");
  return { mode: "merge", in: inDir, noLiveness, date };
}

// ---------------------------------- loaders ----------------------------------

function loadTopics(topicsPath: string): Topic[] {
  const raw = topicsFileSchema.parse(JSON.parse(readFileSync(topicsPath, "utf-8"))).topics;
  return raw.map((t) => topicSchema.parse(t)) as Topic[];
}

function loadResources(resourcesPath: string): CuratedResource[] {
  const raw = resourcesFileSchema.parse(JSON.parse(readFileSync(resourcesPath, "utf-8"))).resources;
  return raw.map((r) => resourceSchema.parse(r)) as CuratedResource[];
}

function loadBlocklist(blocklistPath: string): string[] {
  return blocklistFileSchema.parse(JSON.parse(readFileSync(blocklistPath, "utf-8"))).blocked;
}

function loadRecoveryTargets(pathsPath: string): Set<string> {
  const raw = pathsFileSchema.parse(JSON.parse(readFileSync(pathsPath, "utf-8")));
  const recoveryPath = raw.paths.find((p) => p.id === "path_recupero_media");
  return new Set(recoveryPath?.targetTopicIds ?? []);
}

// ------------------------------------ gaps ------------------------------------

function computeGaps(topicsPath: string, pathsPath: string, resourcesPath: string): TopicGap[] {
  const topics = loadTopics(topicsPath);
  const resources = loadResources(resourcesPath);
  const recoveryTargets = loadRecoveryTargets(pathsPath);

  const gaps: TopicGap[] = [];
  for (const topic of topics) {
    const topicResources = resources.filter((r) => r.topicIds.includes(topic.id));
    const missing = ALL_KINDS.filter((k) => !topicResources.some((r) => r.kind === k));
    if (missing.length === 0) continue;

    const priority: 1 | 2 | 3 = recoveryTargets.has(topic.id) ? 1 : missing.length === 3 ? 2 : 3;

    gaps.push({
      topicId: topic.id,
      name: topic.name,
      description: topic.description,
      evidence: topic.evidence,
      ageRangeStart: topic.ageRangeStart,
      ageRangeEnd: topic.ageRangeEnd,
      missing,
      existingUrls: topicResources.map((r) => r.url),
      priority
    });
  }

  gaps.sort((a, b) => (a.priority !== b.priority ? a.priority - b.priority : a.topicId.localeCompare(b.topicId)));
  return gaps;
}

function printGapsSummary(gaps: TopicGap[], json: boolean): void {
  if (json) {
    console.log(JSON.stringify(gaps, null, 2));
    return;
  }
  const counts = { 1: 0, 2: 0, 3: 0 };
  for (const g of gaps) counts[g.priority]++;
  console.log("");
  console.log(`Topic gaps: ${gaps.length} topic(s) with at least one missing kind.`);
  console.log(`  P1 (recovery-path targets): ${counts[1]}`);
  console.log(`  P2 (missing all 3 kinds):   ${counts[2]}`);
  console.log(`  P3 (partial):                ${counts[3]}`);
  console.log("");
  for (const g of gaps) console.log(`P${g.priority} ${g.topicId} missing: ${g.missing.join(",")}`);
  console.log("");
}

// ----------------------------------- merge ------------------------------------

async function checkLiveness(url: string): Promise<boolean> {
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
}

function rejectReasonFor(
  proposal: ResearchProposal,
  ctx: { blocklist: string[]; existingUrls: Set<string>; seenUrlsThisBatch: Set<string>; topicIds: Set<string> }
): string | null {
  if (new URL(proposal.url).protocol !== "https:") return "url is not https";
  if (ctx.blocklist.some((b) => proposal.url.includes(b))) return "url is blocklisted";
  if (ctx.existingUrls.has(proposal.url)) return "url already present in resources.json";
  if (ctx.seenUrlsThisBatch.has(proposal.url)) return "duplicate url within this merge batch";
  const unknownTopicId = proposal.topicIds.find((t) => !ctx.topicIds.has(t));
  if (unknownTopicId) return `unknown topicId "${unknownTopicId}"`;
  if (proposal.checks.loginWall) return "resource is behind a login wall";
  return null;
}

function printMergeSummary(s: {
  filesRead: number;
  rejectedFiles: { file: string; reason: string }[];
  accepted: (CuratedResource & { validationNotes: string })[];
  rejected: { url: string; reason: string }[];
  outPath?: string;
}): void {
  console.log("");
  console.log(
    `Research merge: ${s.filesRead} file(s) read, ${s.accepted.length} proposal(s) accepted, ${s.rejected.length} rejected.`
  );
  if (s.rejectedFiles.length > 0) {
    console.log(`Rejected files (${s.rejectedFiles.length}):`);
    for (const f of s.rejectedFiles) console.log(`  ${f.file}: ${f.reason}`);
  }
  if (s.rejected.length > 0) {
    console.log(`Rejected proposals (${s.rejected.length}):`);
    for (const r of s.rejected) console.log(`  ${r.url}: ${r.reason}`);
  }
  console.log(s.outPath ? `Proposals written to ${s.outPath}` : "No proposals written.");
  console.log("");
}

// ---------------------------------- CLI orchestration ----------------------------------

export async function runResearchMerge(argv: string[], overrides: ResearchMergeOverrides = {}): Promise<ResearchMergeResult> {
  const args = parseArgs(argv);
  const topicsPath =
    overrides.topicsPath ?? fileURLToPath(new URL("../../taxonomy/data/math-it-media/topics.json", import.meta.url));
  const pathsPath =
    overrides.pathsPath ?? fileURLToPath(new URL("../../taxonomy/data/math-it-media/paths.json", import.meta.url));
  const resourcesPath =
    overrides.resourcesPath ?? fileURLToPath(new URL("../../taxonomy/data/math-it-media/resources.json", import.meta.url));

  if (args.mode === "gaps") {
    const gaps = computeGaps(topicsPath, pathsPath, resourcesPath);
    printGapsSummary(gaps, args.json);
    return { mode: "gaps", accepted: [], rejected: [], rejectedFiles: [], gaps };
  }

  const blocklistPath =
    overrides.blocklistPath ?? fileURLToPath(new URL("../../taxonomy/data/curator-blocklist.json", import.meta.url));
  const reviewDir = overrides.reviewDir ?? fileURLToPath(new URL("../../taxonomy/data/curated-review", import.meta.url));
  const dateStr = args.date ?? overrides.today ?? new Date().toISOString().slice(0, 10);
  const liveness: (url: string) => Promise<boolean> = args.noLiveness
    ? async (_url: string) => true
    : (overrides.liveness ?? checkLiveness);

  const topicIds = new Set(loadTopics(topicsPath).map((t) => t.id));
  const resources = loadResources(resourcesPath);
  const existingUrls = new Set(resources.map((r) => r.url));
  const blocklist = loadBlocklist(blocklistPath);

  if (!existsSync(args.in)) throw new Error(`Inbox dir not found: ${args.in}`);
  const files = readdirSync(args.in).filter((f) => f.endsWith(".json")).sort();

  const accepted: (CuratedResource & { validationNotes: string })[] = [];
  const rejected: { url: string; reason: string }[] = [];
  const rejectedFiles: { file: string; reason: string }[] = [];
  const seenUrlsThisBatch = new Set<string>();

  for (const file of files) {
    const filePath = join(args.in, file);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch (err) {
      rejectedFiles.push({ file, reason: `invalid JSON: ${err instanceof Error ? err.message : String(err)}` });
      continue;
    }
    const parsedFile = inboxFileSchema.safeParse(raw);
    if (!parsedFile.success) {
      const issue = parsedFile.error.issues[0];
      rejectedFiles.push({ file, reason: issue ? `${issue.path.join(".")}: ${issue.message}` : "schema validation failed" });
      continue;
    }
    const inbox = parsedFile.data;

    for (const proposal of inbox.proposals) {
      const reason = rejectReasonFor(proposal, { blocklist, existingUrls, seenUrlsThisBatch, topicIds });
      if (reason) {
        rejected.push({ url: proposal.url, reason });
        continue;
      }
      seenUrlsThisBatch.add(proposal.url);

      if (!(await liveness(proposal.url))) {
        rejected.push({ url: proposal.url, reason: "liveness check failed" });
        continue;
      }

      const flags: string[] = [];
      if (proposal.summary.it.length > 400 || proposal.summary.en.length > 400) flags.push("; summary exceeds 400 chars");
      if (!proposal.checks.fetched) flags.push("; page fetch unverified (checks.fetched=false)");
      const validationNotes =
        `researched ${dateStr} via web-researcher subagent (topic ${inbox.topicId}); ` +
        `evidence fit: ${proposal.evidenceFit}${flags.join("")}; verify safety, liveness and licence before promoting.`;

      // topicIds.length >= 1 is enforced by researchProposalSchema
      // defensive re-validation before writing (core record has no validationNotes yet)
      const core = resourceSchema.parse({
        id: resourceIdFor(proposal.topicIds[0]!, proposal.url),
        topicIds: proposal.topicIds,
        kind: proposal.kind,
        provider: proposal.provider,
        title: proposal.title,
        url: proposal.url,
        lang: proposal.lang,
        summary: proposal.summary,
        addedAt: dateStr
      }) as CuratedResource;
      accepted.push({ ...core, validationNotes });
    }
  }

  const outPathCandidate = join(reviewDir, `${dateStr}-proposals.json`);
  let existingProposals: (CuratedResource & { validationNotes: string })[] = [];
  if (existsSync(outPathCandidate)) {
    existingProposals = (JSON.parse(readFileSync(outPathCandidate, "utf-8")) as ProposalsFile).proposals;
  }
  const seenIds = new Set(existingProposals.map((p) => p.id));
  const newProposals: (CuratedResource & { validationNotes: string })[] = [];
  for (const p of accepted) {
    if (seenIds.has(p.id)) continue;
    seenIds.add(p.id);
    newProposals.push(p);
  }
  const merged = [...existingProposals, ...newProposals];

  let outPath: string | undefined;
  if (merged.length > 0) {
    mkdirSync(reviewDir, { recursive: true });
    writeFileSync(outPathCandidate, JSON.stringify({ proposals: merged }, null, 2));
    outPath = outPathCandidate;
  }

  printMergeSummary({ filesRead: files.length, rejectedFiles, accepted, rejected, outPath });

  return { mode: "merge", accepted: accepted.map((p) => p.id), rejected, rejectedFiles, outPath };
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
  runResearchMerge(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
