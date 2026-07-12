/**
 * Promotes accepted curator proposals into packages/taxonomy/data/math-it-media/resources.json.
 *
 * resources.json is hand-formatted with one compact JSON object per line (not vanilla
 * `JSON.stringify(x, null, 2)`, which would expand every nested object across many lines) — so
 * this appends new lines with the SAME compact per-record style via targeted text surgery,
 * rather than re-serializing the whole file, to keep the diff to "added lines" only.
 *
 * Usage: pnpm --filter @lyceora/agents run curate:promote -- --file <proposals.json> --accept id1,id2
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resourceSchema, type CuratedResource } from "@lyceora/taxonomy";

interface ProposalsFile {
  proposals: (CuratedResource & { validationNotes: string })[];
}
interface ResourcesFile {
  resources: CuratedResource[];
}

export interface PromoteOverrides {
  resourcesPath?: string;
}

export interface PromoteResult {
  promoted: string[];
  resourcesPath: string;
}

interface CliArgs {
  file: string;
  accept: string[];
}

function parseArgs(argv: string[]): CliArgs {
  let file: string | undefined;
  let accept: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file") file = argv[++i];
    else if (a === "--accept") accept = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!file) throw new Error("Provide --file <path>");
  if (accept.length === 0) throw new Error("Provide --accept id1,id2,...");
  return { file, accept };
}

/** Insert `additions` as new compact-JSON lines just before the resources array's closing `]`,
 * leaving every existing byte of `originalText` untouched. Relies on the outer array's `]` being
 * the LAST `]` in the file — true here because JSON nesting guarantees any array nested inside a
 * resource (e.g. topicIds) closes before its containing object, which closes before the outer
 * array does. */
function appendResourcesPreservingFormat(originalText: string, additions: CuratedResource[]): string {
  const closeBracketIdx = originalText.lastIndexOf("]");
  if (closeBracketIdx < 0) throw new Error("resources.json: could not locate the resources array's closing ']'");
  const head = originalText.slice(0, closeBracketIdx);
  const tail = originalText.slice(closeBracketIdx); // starts with "]"
  const headTrimmed = head.replace(/[ \t\r\n]+$/, "");
  const needsComma = !headTrimmed.endsWith("[");
  const newLines = additions.map((r) => `    ${JSON.stringify(r)}`).join(",\n");
  return `${headTrimmed}${needsComma ? ",\n" : "\n"}${newLines}\n  ${tail}`;
}

export function promote(argv: string[], overrides: PromoteOverrides = {}): PromoteResult {
  const args = parseArgs(argv);
  const proposalsFile = JSON.parse(readFileSync(args.file, "utf-8")) as ProposalsFile;
  const acceptIds = new Set(args.accept);

  const byId = new Map(proposalsFile.proposals.map((p) => [p.id, p]));
  const missing = args.accept.filter((id) => !byId.has(id));
  if (missing.length > 0) throw new Error(`--accept id(s) not found in proposals file: ${missing.join(", ")}`);

  const resourcesPath =
    overrides.resourcesPath ?? fileURLToPath(new URL("../../taxonomy/data/math-it-media/resources.json", import.meta.url));
  const originalText = readFileSync(resourcesPath, "utf-8");
  const resourcesFile = JSON.parse(originalText) as ResourcesFile;
  const existingIds = new Set(resourcesFile.resources.map((r) => r.id));

  const collisions = [...acceptIds].filter((id) => existingIds.has(id));
  if (collisions.length > 0) {
    throw new Error(`Refusing to promote: id collision(s) with existing resources.json: ${collisions.join(", ")}`);
  }

  const toAdd: CuratedResource[] = [...acceptIds].map((id) => {
    const { validationNotes, ...core } = byId.get(id)!;
    void validationNotes;
    return resourceSchema.parse(core);
  });

  const newText = appendResourcesPreservingFormat(originalText, toAdd);
  const parsed = JSON.parse(newText) as ResourcesFile; // sanity check: still valid JSON, right count
  if (parsed.resources.length !== resourcesFile.resources.length + toAdd.length) {
    throw new Error("Internal error: format-preserving append produced an unexpected resource count");
  }
  writeFileSync(resourcesPath, newText);

  console.log(`Promoted ${toAdd.length} resource(s) into ${resourcesPath}`);
  for (const r of toAdd) console.log(`  + ${r.id} (${r.kind}, ${r.provider}) ${r.url}`);

  return { promoted: toAdd.map((r) => r.id), resourcesPath };
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
  try {
    promote(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
