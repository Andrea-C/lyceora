import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { user, profile, enrollment, learningSession, masteryState, evidenceRecord, xpEvent, dailyActivity } from "@lyceora/db";
import type { CuratedResource } from "@lyceora/taxonomy";
import { getJourneyState, isBrowsableTopic, recordBrowseView } from "../src/server/services/journey";
import { getPathOverview } from "../src/server/services/path-overview";
import { getGraph, getBrowsableTopicIds, pickSuggested } from "../src/server/content";
import { RECOVERY_PATH_ID } from "../src/server/subjects";
import { ForbiddenError, ConflictError, getBrowseViews, upsertBrowseView } from "../src/server/repo";

let rawDb: ReturnType<typeof drizzle>;
let db: never;
let ownerId: string;
let otherOwnerId: string;

beforeAll(async () => {
  const d = drizzle(new PGlite());
  await migrate(d, { migrationsFolder: fileURLToPath(new URL("../../../packages/db/drizzle", import.meta.url)) });
  await d.insert(user).values([
    { id: "journey-parent", name: "P", email: "journey@x.it", emailVerified: false },
    { id: "journey-other", name: "O", email: "other@x.it", emailVerified: false }
  ]);
  ownerId = "journey-parent";
  otherOwnerId = "journey-other";
  rawDb = d;
  db = d as never;
});

describe("getJourneyState", () => {
  it("unenrolled profile: subject current, everything else upcoming/locked", async () => {
    const [p] = await rawDb.insert(profile).values({ ownerUserId: ownerId, displayName: "Unenrolled" }).returning();
    const state = await getJourneyState(db, p!.id);
    expect(state.enrolled).toBe(false);
    expect(state.diagnosticDone).toBe(false);
    expect(state.resumeDiagnostic).toBe(false);
    expect(state.pathId).toBeNull();
    const byKey = Object.fromEntries(state.phases.map((ph) => [ph.key, ph.state]));
    expect(byKey).toEqual({ subject: "current", assessment: "upcoming", path: "upcoming", final: "locked", certificate: "locked" });
  });

  it("enrolled, pre-diagnostic: subject done, assessment current, path upcoming", async () => {
    const [p] = await rawDb.insert(profile).values({ ownerUserId: ownerId, displayName: "PreDiag" }).returning();
    await rawDb.insert(enrollment).values({ profileId: p!.id, pathId: RECOVERY_PATH_ID });
    const state = await getJourneyState(db, p!.id);
    expect(state.enrolled).toBe(true);
    expect(state.diagnosticDone).toBe(false);
    expect(state.pathId).toBe(RECOVERY_PATH_ID);
    const byKey = Object.fromEntries(state.phases.map((ph) => [ph.key, ph.state]));
    expect(byKey.subject).toBe("done");
    expect(byKey.assessment).toBe("current");
    expect(byKey.path).toBe("upcoming");
  });

  it("resumeDiagnostic is true iff an active diagnostic session row exists", async () => {
    const [p] = await rawDb.insert(profile).values({ ownerUserId: ownerId, displayName: "ResumeDiag" }).returning();
    await rawDb.insert(enrollment).values({ profileId: p!.id, pathId: RECOVERY_PATH_ID });
    await rawDb.insert(learningSession).values({ profileId: p!.id, kind: "diagnostic", status: "active" });
    expect((await getJourneyState(db, p!.id)).resumeDiagnostic).toBe(true);
  });

  it("post-diagnostic: assessment done, path current, final/certificate still locked", async () => {
    const [p] = await rawDb.insert(profile).values({ ownerUserId: ownerId, displayName: "PostDiag" }).returning();
    const [session] = await rawDb.insert(learningSession).values({ profileId: p!.id, kind: "diagnostic", status: "completed" }).returning();
    await rawDb.insert(enrollment).values({ profileId: p!.id, pathId: RECOVERY_PATH_ID, diagnosticSessionId: session!.id });
    const state = await getJourneyState(db, p!.id);
    expect(state.diagnosticDone).toBe(true);
    const byKey = Object.fromEntries(state.phases.map((ph) => [ph.key, ph.state]));
    expect(byKey.assessment).toBe("done");
    expect(byKey.path).toBe("current");
    expect(byKey.final).toBe("locked");
    expect(byKey.certificate).toBe("locked");
  });
});

describe("isBrowsableTopic", () => {
  it("true for an authored topic when enrolled", async () => {
    const [p] = await rawDb.insert(profile).values({ ownerUserId: ownerId, displayName: "Browsable" }).returning();
    await rawDb.insert(enrollment).values({ profileId: p!.id, pathId: RECOVERY_PATH_ID });
    expect(await isBrowsableTopic(db, p!.id, "lyc_potenze_def")).toBe(true);
  });
  it("false when unenrolled", async () => {
    const [p] = await rawDb.insert(profile).values({ ownerUserId: ownerId, displayName: "Unenrolled2" }).returning();
    expect(await isBrowsableTopic(db, p!.id, "lyc_potenze_def")).toBe(false);
  });
  it("false for an imported core topic id, even when enrolled", async () => {
    const [p] = await rawDb.insert(profile).values({ ownerUserId: ownerId, displayName: "CoreTopic" }).returning();
    await rawDb.insert(enrollment).values({ profileId: p!.id, pathId: RECOVERY_PATH_ID });
    expect(await isBrowsableTopic(db, p!.id, "mt_OvyoRo47K-")).toBe(false);
  });
});

describe("recordBrowseView", () => {
  it("throws ForbiddenError for a profile owned by a different user", async () => {
    const [p] = await rawDb.insert(profile).values({ ownerUserId: ownerId, displayName: "Forbidden" }).returning();
    await rawDb.insert(enrollment).values({ profileId: p!.id, pathId: RECOVERY_PATH_ID });
    await expect(recordBrowseView(db, otherOwnerId, p!.id, "lyc_potenze_def")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("throws ConflictError for a topic outside the browsable set", async () => {
    const [p] = await rawDb.insert(profile).values({ ownerUserId: ownerId, displayName: "BadTopic" }).returning();
    await rawDb.insert(enrollment).values({ profileId: p!.id, pathId: RECOVERY_PATH_ID });
    await expect(recordBrowseView(db, ownerId, p!.id, "not-a-real-topic")).rejects.toBeInstanceOf(ConflictError);
  });

  it("throws ConflictError for an unknown resourceId under a real topic", async () => {
    const [p] = await rawDb.insert(profile).values({ ownerUserId: ownerId, displayName: "BadResource" }).returning();
    await rawDb.insert(enrollment).values({ profileId: p!.id, pathId: RECOVERY_PATH_ID });
    await expect(recordBrowseView(db, ownerId, p!.id, "lyc_potenze_def", "not-a-real-resource")).rejects.toBeInstanceOf(ConflictError);
  });

  it("happy path writes a browse_view row for the topic page and for a real resource", async () => {
    const [p] = await rawDb.insert(profile).values({ ownerUserId: ownerId, displayName: "HappyPath" }).returning();
    await rawDb.insert(enrollment).values({ profileId: p!.id, pathId: RECOVERY_PATH_ID });
    await recordBrowseView(db, ownerId, p!.id, "lyc_potenze_def");
    await recordBrowseView(db, ownerId, p!.id, "lyc_potenze_def", "res_pot_v1");
    const rows = (await getBrowseViews(db, p!.id)).filter((r) => r.topicId === "lyc_potenze_def");
    expect(rows.map((r) => r.resourceId).sort()).toEqual(["", "res_pot_v1"]);
  });

  it("view-only invariant: writes zero rows to mastery_state, evidence_record, xp_event, daily_activity", async () => {
    const [p] = await rawDb.insert(profile).values({ ownerUserId: ownerId, displayName: "ViewOnly" }).returning();
    await rawDb.insert(enrollment).values({ profileId: p!.id, pathId: RECOVERY_PATH_ID });
    await recordBrowseView(db, ownerId, p!.id, "lyc_potenze_def", "res_pot_v1");
    expect(await rawDb.select().from(masteryState).where(eq(masteryState.profileId, p!.id))).toHaveLength(0);
    expect(await rawDb.select().from(evidenceRecord).where(eq(evidenceRecord.profileId, p!.id))).toHaveLength(0);
    expect(await rawDb.select().from(xpEvent).where(eq(xpEvent.profileId, p!.id))).toHaveLength(0);
    expect(await rawDb.select().from(dailyActivity).where(eq(dailyActivity.profileId, p!.id))).toHaveLength(0);
  });
});

function resource(id: string, kind: CuratedResource["kind"], lang: CuratedResource["lang"]): CuratedResource {
  return { id, topicIds: ["t1"], kind, provider: "Test", title: { it: id, en: id }, url: `https://example.com/${id}`, lang };
}

describe("pickSuggested", () => {
  it("prefers the first resource matching locale, in input order", () => {
    const out = pickSuggested([resource("a", "video", "en"), resource("b", "video", "it"), resource("c", "video", "it")], "it");
    expect(out.filter((r) => r.suggested).map((r) => r.id)).toEqual(["b"]);
  });
  it("falls back to the first resource of any language when none match locale", () => {
    const out = pickSuggested([resource("a", "video", "en"), resource("b", "video", "en")], "it");
    expect(out.filter((r) => r.suggested).map((r) => r.id)).toEqual(["a"]);
  });
  it("picks exactly one suggested resource per kind", () => {
    const out = pickSuggested(
      [resource("v1", "video", "it"), resource("v2", "video", "it"), resource("e1", "exercises", "en"), resource("a1", "assessment", "it")],
      "it"
    );
    expect(out.filter((r) => r.suggested).map((r) => r.id).sort()).toEqual(["a1", "e1", "v1"]);
  });
  it("preserves input order in the returned array", () => {
    const out = pickSuggested([resource("z", "video", "it"), resource("a", "exercises", "it")], "it");
    expect(out.map((r) => r.id)).toEqual(["z", "a"]);
  });
  it("returns an empty array for empty input", () => {
    expect(pickSuggested([], "it")).toEqual([]);
  });
});

describe("getPathOverview", () => {
  it("groups browsable topics by domain deterministically and reports statuses/viewed/completed flags", async () => {
    const [p] = await rawDb.insert(profile).values({ ownerUserId: ownerId, displayName: "Overview" }).returning();
    await rawDb.insert(masteryState).values({ profileId: p!.id, topicId: "lyc_potenze_def", status: "mastered" });
    await upsertBrowseView(db, p!.id, "lyc_potenze_def");
    const [session] = await rawDb.insert(learningSession).values({ profileId: p!.id, kind: "daily" }).returning();
    await rawDb.insert(xpEvent).values({ profileId: p!.id, sessionId: session!.id, topicId: "lyc_potenze_def", reason: "lessonComplete", amount: 5 });

    const graph = getGraph();
    const overview1 = await getPathOverview(db, graph, p!.id, RECOVERY_PATH_ID, "it");
    const overview2 = await getPathOverview(db, graph, p!.id, RECOVERY_PATH_ID, "it");

    expect(overview1.total).toBe(getBrowsableTopicIds(RECOVERY_PATH_ID).size);
    expect(overview1.groups.map((g) => g.domain)).toEqual(overview2.groups.map((g) => g.domain)); // deterministic
    expect(overview1.groups.reduce((n, g) => n + g.total, 0)).toBe(overview1.total);
    expect(overview1.mastered).toBe(1);

    const powersGroup = overview1.groups.find((g) => g.domain === "Powers & Roots");
    expect(powersGroup).toBeDefined();
    const entry = powersGroup!.topics.find((tp) => tp.id === "lyc_potenze_def");
    expect(entry).toEqual({ id: "lyc_potenze_def", name: "Definizione di potenza", status: "mastered", viewed: true, completed: true });

    const other = powersGroup!.topics.find((tp) => tp.id !== "lyc_potenze_def");
    expect(other?.status).toBe("unknown");
    expect(other?.viewed).toBe(false);
    expect(other?.completed).toBe(false);
  });
});
