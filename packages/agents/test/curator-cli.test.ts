import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBudget, createFakeCuratorPorts } from "../src/curator";
import { runCurator } from "../curate/run-curator";
import { promote } from "../curate/promote";

describe("createBudget", () => {
  it("budget tracker stops the run when estimated spend exceeds the cap", () => {
    const b = createBudget(0.05); // $0.05
    expect(b.spend(0.02)).toBe(true);
    expect(b.spend(0.02)).toBe(true);
    expect(b.spend(0.02)).toBe(false); // would exceed
  });

  it("total() reflects only committed spends, not refused ones", () => {
    const b = createBudget(0.05);
    b.spend(0.02);
    b.spend(0.02);
    b.spend(0.02); // refused
    expect(b.total()).toBeCloseTo(0.04, 10);
  });
});

describe("runCurator (in-process CLI smoke, fake ports)", () => {
  it("curates one real topic against fixture ports and writes a proposals file with the 1 fixture record", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "lyceora-curator-"));
    const outDir = join(tmp, "curated-review");
    const progressFile = join(tmp, ".curator-progress.json");

    const result = await runCurator(
      ["--topic", "lyc_potenze_def", "--budget", "0.01"],
      { ports: createFakeCuratorPorts(), outDir, progressFile }
    );

    expect(result.proposals).toHaveLength(1);
    expect(result.proposalsPath).toBeTruthy();
    expect(existsSync(result.proposalsPath!)).toBe(true);
    expect(existsSync(progressFile)).toBe(true);

    const written = JSON.parse(readFileSync(result.proposalsPath!, "utf-8"));
    expect(written.proposals).toHaveLength(1);
    expect(written.proposals[0]).toHaveProperty("validationNotes");
    expect(written.proposals[0].url).toBe("https://good");
  });
});

describe("promote", () => {
  const ORIGINAL = [
    "{",
    '  "resources": [',
    '    {"id":"res_existing_1","topicIds":["t1"],"kind":"video","provider":"X","title":{"it":"a","en":"a"},"url":"https://existing.example/a","lang":"it"}',
    "  ]",
    "}",
    ""
  ].join("\n");

  function makeTmpResourcesFile(text: string): string {
    const dir = mkdtempSync(join(tmpdir(), "lyceora-promote-resources-"));
    const file = join(dir, "resources.json");
    writeFileSync(file, text);
    return file;
  }

  function makeTmpProposalsFile(proposals: unknown[]): string {
    const dir = mkdtempSync(join(tmpdir(), "lyceora-promote-proposals-"));
    const file = join(dir, "proposals.json");
    writeFileSync(file, JSON.stringify({ proposals }, null, 2));
    return file;
  }

  it("appends accepted resources as new compact-JSON lines, leaving existing bytes untouched", () => {
    const resourcesFile = makeTmpResourcesFile(ORIGINAL);
    const proposalsFile = makeTmpProposalsFile([
      {
        id: "res_new_1", topicIds: ["t2"], kind: "exercises", provider: "Y",
        title: { it: "b", en: "b" }, url: "https://new.example/b", lang: "it",
        validationNotes: "curated for testing"
      }
    ]);

    const result = promote(["--file", proposalsFile, "--accept", "res_new_1"], { resourcesPath: resourcesFile });
    expect(result.promoted).toEqual(["res_new_1"]);

    const newText = readFileSync(resourcesFile, "utf-8");
    expect(newText.startsWith(ORIGINAL.replace(/\s*\]\s*\}\s*$/, ""))).toBe(true); // pre-existing line untouched

    const parsed = JSON.parse(newText) as { resources: { id: string; url: string; validationNotes?: string }[] };
    expect(parsed.resources).toHaveLength(2);
    const added = parsed.resources.find((r) => r.id === "res_new_1");
    expect(added?.url).toBe("https://new.example/b");
    expect(added).not.toHaveProperty("validationNotes");
  });

  it("refuses to promote (and leaves the file untouched) when an accepted id collides with an existing resource", () => {
    const resourcesFile = makeTmpResourcesFile(ORIGINAL);
    const proposalsFile = makeTmpProposalsFile([
      {
        id: "res_existing_1", topicIds: ["t2"], kind: "exercises", provider: "Y",
        title: { it: "b", en: "b" }, url: "https://new.example/b", lang: "it",
        validationNotes: "curated for testing"
      }
    ]);

    expect(() => promote(["--file", proposalsFile, "--accept", "res_existing_1"], { resourcesPath: resourcesFile }))
      .toThrow(/collision/i);
    expect(readFileSync(resourcesFile, "utf-8")).toBe(ORIGINAL);
  });
});
