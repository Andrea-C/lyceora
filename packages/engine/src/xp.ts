export const XP_AMOUNTS = {
  lessonComplete: 5, exerciseCorrect: 2, assessmentPass: 10,
  reviewComplete: 5, diagnosticComplete: 15, streakBonus: 5, goalBonus: 5
} as const;
export type XpReason = keyof typeof XP_AMOUNTS;

export function nextStreak(
  current: { currentStreak: number; longestStreak: number; lastActiveOn: string | null }, today: string
): { currentStreak: number; longestStreak: number } {
  if (current.lastActiveOn === today) return { currentStreak: current.currentStreak, longestStreak: current.longestStreak };
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const isConsecutive = current.lastActiveOn === yesterday.toISOString().slice(0, 10);
  const streak = isConsecutive ? current.currentStreak + 1 : 1;
  return { currentStreak: streak, longestStreak: Math.max(streak, current.longestStreak) };
}
