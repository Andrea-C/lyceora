import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resourceIdFor } from "../src/curator";
import { runResearchMerge } from "../curate/research-merge";

interface WrittenProposal {
  id: string;
  topicIds: string[];
  kind: string;
  provider: string;
  title: { it: string; en: string };
  url: string;
  lang: string;
  summary?: { it: string; en: string };
  addedAt?: string;
  validationNotes: string;
}

function makeTmpDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function fixtureTopic(id: string): Record<string, unknown> {
  return {
    id,
    type: "CONCEPTUAL",
    subject: "Mathematics",
    domain: "Test",
    name: { it: `Nome ${id}`, en: `Name ${id}` },
    description: { it: "desc", en: "desc" },
    ageRangeStart: 11,
    ageRangeEnd: 12,
    evidence: [{ it: "e", en: "e" }],
    assessmentPrompt: { it: "{{name}}?", en: "{{name}}?" },
    standards: []
  };
}

function fixtureResource(id: string, topicId: string, kind: string, url: string): Record<string, unknown> {
  return { id, topicIds: [topicId], kind, provider: "P", title: { it: id, en: id }, url, lang: "it" };
}

function setupGapsFixtures(): { topicsPath: string; pathsPath: string; resourcesPath: string } {
  const dir = makeTmpDir("lyceora-research-gaps-");
  const topicsPath = join(dir, "topics.json");
  const pathsPath = join(dir, "paths.json");
  const resourcesPath = join(dir, "resources.json");

  // t_a: path_recupero_media target with a partial gap -> priority 1
  // t_b: not a target, missing all three kinds -> priority 2
  // t_c: not a target, partial gap -> priority 3
  // t_d: not a target, no gap -> excluded
  writeJson(topicsPath, { topics: [fixtureTopic("t_a"), fixtureTopic("t_b"), fixtureTopic("t_c"), fixtureTopic("t_d")] });
  writeJson(pathsPath, {
    paths: [{ id: "path_recupero_media", name: { it: "Recupero", en: "Recovery" }, targetTopicIds: ["t_a"] }]
  });
  writeJson(resourcesPath, {
    resources: [
      fixtureResource("res_a1", "t_a", "video", "https://a1.example/"),
      fixtureResource("res_c1", "t_c", "exercises", "https://c1.example/"),
      fixtureResource("res_d1", "t_d", "video", "https://d1.example/v"),
      fixtureResource("res_d2", "t_d", "exercises", "https://d1.example/e"),
      fixtureResource("res_d3", "t_d", "assessment", "https://d1.example/a")
    ]
  });

  return { topicsPath, pathsPath, resourcesPath };
}

function setupMergeFixtures(): {
  topicsPath: string;
  resourcesPath: string;
  blocklistPath: string;
  reviewDir: string;
  inboxDir: string;
} {
  const dir = makeTmpDir("lyceora-research-merge-");
  const topicsPath = join(dir, "topics.json");
  const resourcesPath = join(dir, "resources.json");
  const blocklistPath = join(dir, "blocklist.json");
  const reviewDir = join(dir, "curated-review");
  const inboxDir = join(dir, "inbox");
  mkdirSync(inboxDir, { recursive: true });

  writeJson(topicsPath, { topics: [fixtureTopic("t_a"), fixtureTopic("t_b")] });
  writeJson(resourcesPath, { resources: [fixtureResource("res_existing", "t_a", "video", "https://existing.example/r")] });
  writeJson(blocklistPath, { blocked: ["blocked-domain.example"] });

  return { topicsPath, resourcesPath, blocklistPath, reviewDir, inboxDir };
}

function proposalFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    topicIds: ["t_a"],
    kind: "exercises",
    provider: "Prov",
    title: { it: "Titolo", en: "Title" },
    url: "https://dup.example/x",
    lang: "it",
    summary: { it: "Riassunto", en: "Summary" },
    evidenceFit: "fits",
    checks: { fetched: true, loginWall: false },
    ...overrides
  };
}

describe("runResearchMerge --gaps", () => {
  it("classifies priority (path target => 1, missing all => 2, partial => 3), reports missing/existingUrls, and excludes topics with no gaps", async () => {
    const { topicsPath, pathsPath, resourcesPath } = setupGapsFixtures();
    const result = await runResearchMerge(["--gaps", "--json"], { topicsPath, pathsPath, resourcesPath });

    expect(result.mode).toBe("gaps");
    const gaps = result.gaps!;
    expect(gaps.map((g) => g.topicId)).toEqual(["t_a", "t_b", "t_c"]); // sorted by priority then topicId; t_d excluded

    const a = gaps.find((g) => g.topicId === "t_a")!;
    expect(a.priority).toBe(1);
    expect(a.missing).toEqual(["exercises", "assessment"]);
    expect(a.existingUrls).toEqual(["https://a1.example/"]);

    const b = gaps.find((g) => g.topicId === "t_b")!;
    expect(b.priority).toBe(2);
    expect(b.missing).toEqual(["video", "exercises", "assessment"]);
    expect(b.existingUrls).toEqual([]);

    const c = gaps.find((g) => g.topicId === "t_c")!;
    expect(c.priority).toBe(3);
    expect(c.missing).toEqual(["video", "assessment"]);
    expect(c.existingUrls).toEqual(["https://c1.example/"]);
  });

  it("returns the gaps array even without --json (only stdout formatting differs)", async () => {
    const { topicsPath, pathsPath, resourcesPath } = setupGapsFixtures();
    const result = await runResearchMerge(["--gaps"], { topicsPath, pathsPath, resourcesPath });
    expect(result.gaps).toHaveLength(3);
  });
});

describe("runResearchMerge --merge", () => {
  it("accepts a valid proposal with a deterministic id, addedAt from --date/today, and validationNotes containing evidenceFit", async () => {
    const { topicsPath, resourcesPath, blocklistPath, reviewDir, inboxDir } = setupMergeFixtures();
    writeJson(join(inboxDir, "t_a.json"), {
      topicId: "t_a",
      proposals: [proposalFixture({ url: "https://new-a.example/ex", evidenceFit: "covers evidence item 2 directly" })]
    });

    const result = await runResearchMerge(["--merge", "--in", inboxDir, "--no-liveness"], {
      topicsPath, resourcesPath, blocklistPath, reviewDir, today: "2026-08-01"
    });

    const expectedId = resourceIdFor("t_a", "https://new-a.example/ex");
    expect(result.accepted).toEqual([expectedId]);
    expect(result.rejected).toEqual([]);
    expect(result.outPath).toBe(join(reviewDir, "2026-08-01-proposals.json"));

    const written = JSON.parse(readFileSync(result.outPath!, "utf-8")) as { proposals: WrittenProposal[] };
    expect(written.proposals).toHaveLength(1);
    expect(written.proposals[0]!.id).toBe(expectedId);
    expect(written.proposals[0]!.addedAt).toBe("2026-08-01");
    expect(written.proposals[0]!.validationNotes).toContain("covers evidence item 2 directly");
    expect(written.proposals[0]!.validationNotes).toContain("topic t_a");
  });

  it("rejects non-https urls, blocklisted domains, urls already in resources.json, in-batch duplicates, unknown topicIds, and login-walled proposals", async () => {
    const { topicsPath, resourcesPath, blocklistPath, reviewDir, inboxDir } = setupMergeFixtures();
    writeJson(join(inboxDir, "t_a.json"), {
      topicId: "t_a",
      proposals: [
        proposalFixture({ url: "http://insecure.example/x" }),
        proposalFixture({ url: "https://blocked-domain.example/x" }),
        proposalFixture({ url: "https://existing.example/r" }), // already in resources.json
        proposalFixture({ url: "https://dupe.example/x" }),
        proposalFixture({ url: "https://dupe.example/x" }), // in-batch duplicate of the previous
        proposalFixture({ url: "https://unknown-topic.example/x", topicIds: ["nonexistent_topic"] }),
        proposalFixture({ url: "https://loginwall.example/x", checks: { fetched: true, loginWall: true } })
      ]
    });

    const result = await runResearchMerge(["--merge", "--in", inboxDir], {
      topicsPath, resourcesPath, blocklistPath, reviewDir, today: "2026-08-01", liveness: async () => true
    });

    const byUrl = new Map(result.rejected.map((r) => [r.url, r.reason]));
    expect(byUrl.get("http://insecure.example/x")).toMatch(/https/i);
    expect(byUrl.get("https://blocked-domain.example/x")).toMatch(/blocklist/i);
    expect(byUrl.get("https://existing.example/r")).toMatch(/already present/i);
    expect(byUrl.get("https://unknown-topic.example/x")).toMatch(/unknown topicId/i);
    expect(byUrl.get("https://loginwall.example/x")).toMatch(/login wall/i);

    const dupeRejections = result.rejected.filter((r) => r.url === "https://dupe.example/x");
    expect(dupeRejections).toHaveLength(1);
    expect(dupeRejections[0]!.reason).toMatch(/duplicate url/i);

    expect(result.rejected).toHaveLength(6);
    expect(result.accepted).toHaveLength(1); // only the first https://dupe.example/x survives
  });

  it("flags long summaries and unfetched pages in validationNotes without rejecting the proposal", async () => {
    const { topicsPath, resourcesPath, blocklistPath, reviewDir, inboxDir } = setupMergeFixtures();
    const longSummary = "x".repeat(401);
    writeJson(join(inboxDir, "t_a.json"), {
      topicId: "t_a",
      proposals: [
        proposalFixture({
          url: "https://flagged.example/v",
          summary: { it: "short", en: longSummary },
          checks: { fetched: false, loginWall: false }
        })
      ]
    });

    const result = await runResearchMerge(["--merge", "--in", inboxDir, "--no-liveness"], {
      topicsPath, resourcesPath, blocklistPath, reviewDir, today: "2026-08-01"
    });

    expect(result.rejected).toEqual([]);
    expect(result.accepted).toHaveLength(1);

    const written = JSON.parse(readFileSync(result.outPath!, "utf-8")) as { proposals: WrittenProposal[] };
    expect(written.proposals[0]!.validationNotes).toContain("summary exceeds 400 chars");
    expect(written.proposals[0]!.validationNotes).toContain("page fetch unverified (checks.fetched=false)");
  });

  it("reports a malformed inbox file and still processes the other files", async () => {
    const { topicsPath, resourcesPath, blocklistPath, reviewDir, inboxDir } = setupMergeFixtures();
    writeFileSync(join(inboxDir, "bad.json"), "{ not valid json");
    writeJson(join(inboxDir, "good.json"), {
      topicId: "t_a",
      proposals: [proposalFixture({ url: "https://good-file.example/v" })]
    });

    const result = await runResearchMerge(["--merge", "--in", inboxDir, "--no-liveness"], {
      topicsPath, resourcesPath, blocklistPath, reviewDir, today: "2026-08-01"
    });

    expect(result.rejectedFiles).toHaveLength(1);
    expect(result.rejectedFiles[0]!.file).toBe("bad.json");
    expect(result.accepted).toHaveLength(1);
  });

  it("does not duplicate ids in the output file when re-merging the same inbox for the same date", async () => {
    const { topicsPath, resourcesPath, blocklistPath, reviewDir, inboxDir } = setupMergeFixtures();
    writeJson(join(inboxDir, "t_a.json"), {
      topicId: "t_a",
      proposals: [proposalFixture({ url: "https://repeat.example/a", kind: "assessment" })]
    });

    const overrides = { topicsPath, resourcesPath, blocklistPath, reviewDir, today: "2026-08-01", liveness: async () => true };
    const first = await runResearchMerge(["--merge", "--in", inboxDir], overrides);
    const second = await runResearchMerge(["--merge", "--in", inboxDir], overrides);

    expect(first.accepted).toHaveLength(1);
    expect(second.accepted).toHaveLength(1); // still validated & "accepted" this run, just not newly written

    const written = JSON.parse(readFileSync(first.outPath!, "utf-8")) as { proposals: WrittenProposal[] };
    expect(written.proposals).toHaveLength(1);
  });
});
