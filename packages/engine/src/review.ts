export const INTERVAL_LADDER_DAYS = [1, 3, 7, 14, 30, 60] as const;

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

export function applyReviewOutcome(row: ReviewRow, passed: boolean, today: string): ReviewRow {
  if (passed) {
    const rung = Math.min(row.intervalRung + 1, INTERVAL_LADDER_DAYS.length - 1);
    return { ...row, intervalRung: rung, dueOn: addDays(today, INTERVAL_LADDER_DAYS[rung]!), lapses: row.lapses, suspended: false };
  }
  const lapses = row.lapses + 1;
  return {
    ...row,
    intervalRung: Math.max(0, row.intervalRung - 1),
    dueOn: today,                       // surface immediately as remediation
    lapses,
    suspended: lapses >= 2              // pulled from rotation until re-mastered
  };
}
