import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { user, profile, enrollment, masteryState, dailyActivity, awardedBadge } from "@lyceora/db";
import { buildGraph, type Topic } from "@lyceora/taxonomy";
import { getProfileReport } from "../src/server/services/profile-report";
import { localToday } from "../src/server/services/session";

const t = (id: string, domain: string): Topic => ({
  id, type: "CONCEPTUAL", subject: "Mathematics", domain,
  name: { it: id, en: id }, description: { it: id, en: id }, ageRangeStart: 11, ageRangeEnd: 12,
  evidence: [{ it: "e", en: "e" }], assessmentPrompt: { it: "{{name}}?", en: "{{name}}?" }, standards: []
});
// The only path in taxonomy data (path_recupero_media) targets 8 real lyc_* topic ids; only
// two of them are given synthetic graph entries here (the rest fall out of domain bucketing,
// which is fine — the report skips topic ids missing from the graph rather than crashing).
const graph = buildGraph(
  [t("lyc_potenze_espressioni", "Arithmetic"), t("lyc_div_mcm_mcd_problemi", "Arithmetic")], []
);
const PATH_ID = "path_recupero_media";

/** The local calendar date `days` before `todayIso` (mirrors the report's own date math). */
function isoMinusDays(todayIso: string, days: number): string {
  const d = new Date(`${todayIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

let db: never;
let profileId: string;
let unenrolledProfileId: string;

beforeAll(async () => {
  const d = drizzle(new PGlite());
  await migrate(d, { migrationsFolder: fileURLToPath(new URL("../../../packages/db/drizzle", import.meta.url)) });
  await d.insert(user).values({ id: "report-parent", name: "P", email: "report@x.it", emailVerified: false });

  const [p] = await d.insert(profile).values({ ownerUserId: "report-parent", displayName: "Nora" }).returning();
  profileId = p!.id;
  await d.insert(enrollment).values({ profileId, pathId: PATH_ID });
  await d.insert(masteryState).values([
    { profileId, topicId: "lyc_potenze_espressioni", status: "mastered" },
    { profileId, topicId: "lyc_div_mcm_mcd_problemi", status: "inProgress" }
  ]);
  const todayIso = localToday(p!.timezone);
  await d.insert(dailyActivity).values([
    { profileId, activityDate: todayIso, xpEarned: 20, goalXp: 30 },
    { profileId, activityDate: isoMinusDays(todayIso, 1), xpEarned: 15, goalXp: 30 }
  ]);
  await d.insert(awardedBadge).values({ profileId, badgeId: "prima-maestria" });

  const [unenrolled] = await d.insert(profile).values({ ownerUserId: "report-parent", displayName: "Leo" }).returning();
  unenrolledProfileId = unenrolled!.id;

  db = d as never;
});

describe("getProfileReport", () => {
  it("assembles domains, zero-filled days, and weekly sums", async () => {
    const r = await getProfileReport(db, graph, profileId, "it");
    expect(r.days).toHaveLength(14);
    expect(r.days.filter((d) => d.xp > 0)).toHaveLength(2);
    expect(r.domains.length).toBeGreaterThan(0);
    expect(r.recentBadges.map((b) => b.badgeId)).toContain("prima-maestria");
  });

  it("skips domain bars gracefully for unenrolled profiles", async () => {
    const r = await getProfileReport(db, graph, unenrolledProfileId, "it");
    expect(r.domains).toEqual([]);
    expect(r.days).toHaveLength(14);
  });

  it("throws a plain Error for an unknown profile id", async () => {
    await expect(getProfileReport(db, graph, "00000000-0000-0000-0000-000000000000", "it"))
      .rejects.toThrow("Unknown profile 00000000-0000-0000-0000-000000000000");
  });
});
