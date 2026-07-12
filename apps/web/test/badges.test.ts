import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { user, profile, masteryState, reviewQueue, learningSession, awardedBadge } from "@lyceora/db";
import { buildGraph, type Topic } from "@lyceora/taxonomy";
import { eq } from "drizzle-orm";
import { checkAndAwardBadges } from "../src/server/services/badges";

const t = (id: string): Topic => ({
  id, type: "CONCEPTUAL", subject: "Mathematics", domain: "Arithmetic",
  name: { it: id, en: id }, description: { it: id, en: id }, ageRangeStart: 11, ageRangeEnd: 12,
  evidence: [{ it: "e", en: "e" }], assessmentPrompt: { it: "{{name}}?", en: "{{name}}?" }, standards: []
});
// topicA + topicB share a domain ("Arithmetic") — the costellazione test masters both to complete
// the whole domain scoped to pathTopicIds.
const graph = buildGraph([t("topicA"), t("topicB")], []);
const pathTopicIds = ["topicA", "topicB"];

let rawDb: ReturnType<typeof drizzle>;
let db: never;
let profileId: string;

beforeAll(async () => {
  const d = drizzle(new PGlite());
  await migrate(d, { migrationsFolder: fileURLToPath(new URL("../../../packages/db/drizzle", import.meta.url)) });
  await d.insert(user).values({ id: "badge-parent", name: "P", email: "badges@x.it", emailVerified: false });
  const [p] = await d.insert(profile).values({ ownerUserId: "badge-parent", displayName: "Nora" }).returning();
  profileId = p!.id;
  rawDb = d;
  db = d as never;
});

describe("checkAndAwardBadges", () => {
  it("awards primi-passi once after a completed diagnostic session, idempotently", async () => {
    await rawDb.insert(learningSession).values({ profileId, kind: "diagnostic", status: "completed" });

    const first = await checkAndAwardBadges(db, graph, pathTopicIds, profileId);
    expect(first).toContain("primi-passi");
    const second = await checkAndAwardBadges(db, graph, pathTopicIds, profileId);
    expect(second).toEqual([]);
    expect(await rawDb.select().from(awardedBadge).where(eq(awardedBadge.profileId, profileId))).toHaveLength(first.length);
  });

  it("awards costellazione when every path topic of one domain is mastered", async () => {
    await rawDb.insert(masteryState).values([
      { profileId, topicId: "topicA", status: "mastered" },
      { profileId, topicId: "topicB", status: "mastered" }
    ]);

    const awarded = await checkAndAwardBadges(db, graph, ["topicA", "topicB"], profileId);
    expect(awarded).toContain("costellazione");
  });

  it("awards rimonta after a passed review on a lapsed topic", async () => {
    await rawDb.insert(reviewQueue).values({
      profileId, topicId: "topicA", intervalRung: 1, dueOn: "2026-01-01",
      lapses: 1, suspended: false, lastReviewedAt: new Date()
    });

    const awarded = await checkAndAwardBadges(db, graph, pathTopicIds, profileId);
    expect(awarded).toContain("rimonta");
  });
});
