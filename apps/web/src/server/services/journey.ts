import { and, eq } from "drizzle-orm";
import type { Db } from "@lyceora/db";
import { learningSession } from "@lyceora/db";
import { getBrowsableTopicIds, getResources } from "../content";
import * as repo from "../repo";

export type JourneyPhaseKey = "subject" | "assessment" | "path" | "final" | "certificate";
export type JourneyPhaseState = "done" | "current" | "upcoming" | "locked";

export interface JourneyState {
  phases: { key: JourneyPhaseKey; state: JourneyPhaseState }[];
  enrolled: boolean;
  diagnosticDone: boolean;
  resumeDiagnostic: boolean;
  pathId: string | null;
}

/**
 * Single flip-point for the future "final review + certificate" milestone: the path phase has no
 * completion criteria yet, so final/certificate are always locked. Once that milestone ships, flip
 * this to the real check — everything downstream (final/certificate phase state) reads through
 * here rather than being hardcoded at each call site.
 */
function phaseFourUnlocked(): boolean {
  return false;
}

export async function getJourneyState(db: Db, profileId: string): Promise<JourneyState> {
  const enrollment = await repo.getActiveEnrollment(db, profileId);
  const enrolled = enrollment !== null;
  const diagnosticDone = enrolled && enrollment.diagnosticSessionId != null;

  const [activeDiagnostic] = await db.select().from(learningSession).where(and(
    eq(learningSession.profileId, profileId),
    eq(learningSession.kind, "diagnostic"),
    eq(learningSession.status, "active")
  ));
  const resumeDiagnostic = !!activeDiagnostic;

  const unlocked = phaseFourUnlocked();
  const phases: JourneyState["phases"] = [
    { key: "subject", state: enrolled ? "done" : "current" },
    { key: "assessment", state: !enrolled ? "upcoming" : diagnosticDone ? "done" : "current" },
    { key: "path", state: diagnosticDone ? "current" : "upcoming" },
    { key: "final", state: unlocked ? "upcoming" : "locked" },
    { key: "certificate", state: unlocked ? "upcoming" : "locked" }
  ];

  return { phases, enrolled, diagnosticDone, resumeDiagnostic, pathId: enrollment?.pathId ?? null };
}

/** Active enrollment + topicId in the enrolled path's browsable set. */
export async function isBrowsableTopic(db: Db, profileId: string, topicId: string): Promise<boolean> {
  const enrollment = await repo.getActiveEnrollment(db, profileId);
  if (!enrollment) return false;
  return getBrowsableTopicIds(enrollment.pathId).has(topicId);
}

/**
 * Records a browse-mode view. Tenant-gated via repo.getOwnedProfile. View-only: the only DB write
 * here is repo.upsertBrowseView (browse_view) — never mastery, XP, streaks, or the evidence ledger.
 */
export async function recordBrowseView(
  db: Db, userId: string, profileId: string, topicId: string, resourceId?: string
): Promise<void> {
  const p = await repo.getOwnedProfile(db, userId, profileId);
  const enrollment = await repo.getActiveEnrollment(db, p.id);
  const browsable = enrollment ? getBrowsableTopicIds(enrollment.pathId) : new Set<string>();
  if (!browsable.has(topicId)) {
    throw new repo.ConflictError(`topic ${topicId} is not browsable for profile ${p.id}`);
  }
  if (resourceId !== undefined && !getResources(topicId).some((r) => r.id === resourceId)) {
    throw new repo.ConflictError(`resource ${resourceId} does not exist for topic ${topicId}`);
  }
  await repo.upsertBrowseView(db, p.id, topicId, resourceId);
}
