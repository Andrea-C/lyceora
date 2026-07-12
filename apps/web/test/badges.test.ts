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
// topicA + topicB + topicC all share a domain ("Arithmetic"). Only topicA/topicB are
// pathTopicIds; topicC stays unmastered throughout and is deliberately never in pathTopicIds —
// this is what makes the costellazione test able to detect broken scoping: a correct
// implementation only ever looks at pathTopicIds when deciding domain completion, so topicC's
// unmastered status must not block the "Arithmetic" domain (scoped to topicA+topicB) from
// counting as complete. A buggy implementation that iterated the whole graph instead of
// pathTopicIds would see topicC unmastered and wrongly withhold the badge.
const graph = buildGraph([t("topicA"), t("topicB"), t("topicC")], []);
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

  it("awards costellazione when every path topic of one domain is mastered (scoped to pathTopicIds, not the whole graph)", async () => {
    await rawDb.insert(masteryState).values([
      { profileId, topicId: "topicA", status: "mastered" },
      { profileId, topicId: "topicB", status: "mastered" }
    ]);
    // topicC (same domain, same graph) is deliberately left unmastered and is NOT in
    // pathTopicIds — see the comment on `graph` above for why this pins the scoping contract.

    const awarded = await checkAndAwardBadges(db, graph, ["topicA", "topicB"], profileId);
    expect(awarded).toContain("costellazione");
  });

  it("awards rimonta when the caller signals a passed review on a lapsed topic (event-driven, not row-state)", async () => {
    const awarded = await checkAndAwardBadges(db, graph, pathTopicIds, profileId, { cameBackAfterLapse: true });
    expect(awarded).toContain("rimonta");
  });

  it("does not award rimonta without the event, even with a comeback-looking review_queue row present", async () => {
    // pins the removal of the row-state proxy: a row that LOOKS like a passed comeback (lapses >=
    // 1, suspended false, intervalRung >= 1, lastReviewedAt set) — indistinguishable from what a
    // FAILED review at rung >= 2 also leaves behind — must NOT award rimonta on its own. Only the
    // explicit event hint from session.ts's review-bookkeeping branch may award it.
    const [p] = await rawDb.insert(profile).values({ ownerUserId: "badge-parent", displayName: "NoEvent" }).returning();
    const pid = p!.id;
    await rawDb.insert(reviewQueue).values({
      profileId: pid, topicId: "topicA", intervalRung: 1, dueOn: "2026-01-01",
      lapses: 1, suspended: false, lastReviewedAt: new Date()
    });

    const awarded = await checkAndAwardBadges(db, graph, pathTopicIds, pid);
    expect(awarded).not.toContain("rimonta");
  });

  it("does not award primi-passi while the only diagnostic session is still active", async () => {
    const [p] = await rawDb.insert(profile).values({ ownerUserId: "badge-parent", displayName: "ActiveDiag" }).returning();
    const pid = p!.id;
    await rawDb.insert(learningSession).values({ profileId: pid, kind: "diagnostic", status: "active" });

    const awarded = await checkAndAwardBadges(db, graph, pathTopicIds, pid);
    expect(awarded).not.toContain("primi-passi");
  });
});
