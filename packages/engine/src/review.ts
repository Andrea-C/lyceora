import type { MasteryStatus } from "@lyceora/taxonomy";

export const INTERVAL_LADDER_DAYS = [1, 3, 7, 14, 30, 60] as const;

export const FAST_PROMOTE_STREAK = 4;
export const FAST_PROMOTE_STEP = 2;

export interface ReviewRow {
  topicId: string;
  intervalRung: number;
  dueOn: string;        // YYYY-MM-DD in the profile's local timezone
  lapses: number;
  suspended: boolean;
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function enterReviewRotation(topicId: string, today: string): ReviewRow {
  return { topicId, intervalRung: 0, dueOn: addDays(today, 1), lapses: 0, suspended: false };
}

export function applyReviewOutcome(
  row: ReviewRow, passed: boolean, today: string, opts: { masteryStreak?: number } = {}
): ReviewRow {
  if (passed) {
    const step = (opts.masteryStreak ?? 0) >= FAST_PROMOTE_STREAK ? FAST_PROMOTE_STEP : 1;
    const rung = Math.min(row.intervalRung + step, INTERVAL_LADDER_DAYS.length - 1);
    return { ...row, intervalRung: rung, dueOn: addDays(today, INTERVAL_LADDER_DAYS[rung]!), lapses: row.lapses, suspended: false };
  }
  const lapses = row.lapses + 1;
  return { ...row, intervalRung: Math.max(0, row.intervalRung - 1), dueOn: today, lapses, suspended: lapses >= 2 };
}

/** Credit-only implicit review: refresh (never advance, never pull earlier, never create). */
export function applyImplicitReview(
  input: { row: ReviewRow; masteryStatus: MasteryStatus }, today: string
): ReviewRow {
  const { row, masteryStatus } = input;
  if (masteryStatus !== "mastered" || row.suspended) return row;
  const refreshed = addDays(today, INTERVAL_LADDER_DAYS[row.intervalRung]!);
  const dueOn = refreshed > row.dueOn ? refreshed : row.dueOn;
  return dueOn === row.dueOn ? row : { ...row, dueOn };
}

/** Grade-path batch over the DIRECT hard prerequisites of the just-answered topic. Returns only
 * rows whose dueOn changed. Direct-only is deliberate: transitive credit widens the blast radius
 * of suppressed reviews exactly where a recovery student's false mastery hides. */
export function computeImplicitReviews(
  directHardPrereqIds: string[],
  reviewRowOf: (topicId: string) => ReviewRow | undefined,
  masteryStatusOf: (topicId: string) => MasteryStatus,
  today: string
): ReviewRow[] {
  const changed: ReviewRow[] = [];
  for (const id of directHardPrereqIds) {
    const row = reviewRowOf(id);
    if (!row) continue;
    const next = applyImplicitReview({ row, masteryStatus: masteryStatusOf(id) }, today);
    if (next.dueOn !== row.dueOn) changed.push(next);
  }
  return changed;
}
