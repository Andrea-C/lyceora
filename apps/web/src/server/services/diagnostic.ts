import type { Db } from "@lyceora/db";
import { evidenceRecord, learningSession, xpEvent, reviewQueue, enrollment } from "@lyceora/db";
import { and, eq, sql } from "drizzle-orm";
import type { TopicGraph } from "@lyceora/taxonomy";
import {
  initDiagnostic, runDiagnosticStep, applyEvidence, enterReviewRotation, XP_AMOUNTS,
  type DiagnosticState, type DiagnosticResult, type SessionPlan
} from "@lyceora/engine";
import type { Exercise } from "@lyceora/agents";
import * as repo from "../repo";
import { localToday, type AssessorPort } from "./session";

/**
 * `learningSession.planJson` is typed for the daily-session `SessionPlan` shape; a diagnostic
 * run has no plan of its own until it finishes, so it reuses the same jsonb column to persist
 * the reducer state + the one exercise currently awaiting an answer. Cast at the boundary only.
 */
interface DiagnosticPlanJson {
  pathId: string;
  diagnosticState: DiagnosticState;
  currentExercise: Exercise;
}
function toPlanJson(v: DiagnosticPlanJson): SessionPlan {
  return v as unknown as SessionPlan;
}
function fromPlanJson(v: SessionPlan): DiagnosticPlanJson {
  return v as unknown as DiagnosticPlanJson;
}

/**
 * pathId + targetTopicIds are both resolved by the caller (the route derives them from the
 * profile's active enrollment via repo.getActiveEnrollment + content.ts's getPath) rather than
 * looked up here, so this service has no dependency on the real taxonomy content singleton and
 * is fully unit-testable against a synthetic graph.
 */
export async function startDiagnostic(
  db: Db, graph: TopicGraph, assessor: AssessorPort, userId: string, profileId: string,
  pathId: string, targetTopicIds: string[]
) {
  const p = await repo.getOwnedProfile(db, userId, profileId);
  const init = initDiagnostic(graph, targetTopicIds);
  const { state, step } = runDiagnosticStep(graph, init, null);

  const [s] = await db.insert(learningSession).values({ profileId: p.id, kind: "diagnostic" }).returning();

  if (step.kind === "done") {
    // degenerate: nothing to ask (e.g. an already-fully-known target set) — finalize immediately
    const result = await finalizeDiagnostic(db, p, s!.id, pathId, step.result);
    return { sessionId: s!.id, done: true as const, result };
  }

  const [exercise] = await assessor.generate(step.topicId, p.locale, 2, 1);
  await db.update(learningSession)
    .set({ planJson: toPlanJson({ pathId, diagnosticState: state, currentExercise: exercise! }) })
    .where(eq(learningSession.id, s!.id));
  return { sessionId: s!.id, done: false as const, question: { topicId: step.topicId, exercise: exercise! } };
}

export async function answerDiagnostic(
  db: Db, graph: TopicGraph, assessor: AssessorPort, userId: string,
  args: { profileId: string; sessionId: string; exerciseId: string; answer: string }
) {
  const p = await repo.getOwnedProfile(db, userId, args.profileId);
  const [row] = await db.select().from(learningSession)
    .where(and(eq(learningSession.id, args.sessionId), eq(learningSession.profileId, p.id)));
  if (!row) throw new repo.ForbiddenError(`session ${args.sessionId} not owned by profile ${p.id}`);
  // once finalizeDiagnostic flips this to "completed" (in the same synchronous flow that awards
  // XP), any replayed/duplicate answer POST for this session must be rejected before it can
  // re-grade or re-award anything — this is the whole idempotency guarantee.
  if (row.status !== "active") {
    throw new repo.ConflictError(`diagnostic session ${args.sessionId} is not active (status=${row.status})`);
  }
  if (!row.planJson) throw new repo.ConflictError(`no pending diagnostic question for session ${args.sessionId}`);
  const stored = fromPlanJson(row.planJson);
  const topicId = stored.diagnosticState.currentTopicId;
  if (!topicId) throw new repo.ConflictError(`no pending diagnostic question for session ${args.sessionId}`);
  // mid-run replay nonce: the client echoes back only the *id* of the question it's answering
  // (never the full exercise, so correctAnswer/explanation never round-trip) — a stale/replayed
  // answer for a question that's no longer pending (the diagnostic has already moved on) must be
  // rejected before anything is graded or written.
  if (stored.currentExercise.id !== args.exerciseId) {
    throw new repo.ConflictError(`exerciseId ${args.exerciseId} does not match the pending diagnostic question`);
  }

  // grade the server-persisted exercise only — the client-supplied exerciseId above is only a
  // nonce check, never the graded content itself.
  const graded = await assessor.grade(stored.currentExercise, args.answer, p.locale);
  await db.insert(evidenceRecord).values({
    profileId: p.id, topicId, sessionId: args.sessionId, source: "diagnostic",
    isCorrect: graded.correct, difficulty: stored.currentExercise.difficulty,
    question: stored.currentExercise.prompt, studentAnswer: args.answer,
    rubricNotes: graded.feedback, promptRef: stored.currentExercise.id
  });
  const before = await repo.getMasteryOrEmpty(db, p.id, topicId);
  const after = applyEvidence(before, [{
    source: "diagnostic", isCorrect: graded.correct, difficulty: stored.currentExercise.difficulty, createdAt: new Date()
  }]);
  await repo.upsertMastery(db, p.id, topicId, after);

  const { state, step } = runDiagnosticStep(graph, stored.diagnosticState, { topicId, passed: graded.correct });

  if (step.kind === "ask") {
    const [exercise] = await assessor.generate(step.topicId, p.locale, 2, 1);
    await db.update(learningSession)
      .set({ planJson: toPlanJson({ pathId: stored.pathId, diagnosticState: state, currentExercise: exercise! }) })
      .where(eq(learningSession.id, args.sessionId));
    return { done: false as const, question: { topicId: step.topicId, exercise: exercise! } };
  }

  const result = await finalizeDiagnostic(db, p, args.sessionId, stored.pathId, step.result);
  return { done: true as const, result };
}

async function finalizeDiagnostic(
  db: Db, p: { id: string; timezone: string }, sessionId: string, pathId: string, result: DiagnosticResult
): Promise<DiagnosticResult> {
  const today = localToday(p.timezone);
  const now = new Date();

  // mastered (direct evidence already folded them via applyEvidence above) + assumedMastered
  // (pruned, never directly tested) both test out as mastered.
  for (const topicId of [...result.mastered, ...result.assumedMastered]) {
    const prev = await repo.getMasteryOrEmpty(db, p.id, topicId);
    await repo.upsertMastery(db, p.id, topicId, {
      ...prev, status: "mastered", masteredAt: prev.masteredAt ?? now, lastEvidenceAt: now
    });
  }
  // assumed (never directly probed) get a rung-0 confirm review rather than being trusted forever
  for (const topicId of result.assumedMastered) {
    const r = enterReviewRotation(topicId, today);
    await db.insert(reviewQueue).values({ profileId: p.id, ...r })
      .onConflictDoUpdate({ target: [reviewQueue.profileId, reviewQueue.topicId],
        set: { intervalRung: r.intervalRung, dueOn: r.dueOn, suspended: false } });
  }

  await db.insert(xpEvent).values({
    profileId: p.id, sessionId, reason: "diagnosticComplete", amount: XP_AMOUNTS.diagnosticComplete
  });
  await db.update(learningSession).set({
    status: "completed", endedAt: now,
    xpEarned: sql`${learningSession.xpEarned} + ${XP_AMOUNTS.diagnosticComplete}`
  }).where(eq(learningSession.id, sessionId));
  await db.update(enrollment).set({ diagnosticSessionId: sessionId })
    .where(and(eq(enrollment.profileId, p.id), eq(enrollment.pathId, pathId)));

  return result;
}
