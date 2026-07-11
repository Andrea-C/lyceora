import type { MasteryStatus } from "@lyceora/taxonomy";

export interface MasteryState {
  status: MasteryStatus;
  consecutiveCorrectAtLevel: number;
  totalCorrect: number;
  totalAttempts: number;
  lapses: number;
  masteredAt: Date | null;
  lastEvidenceAt: Date | null;
}

export interface EvidenceInput {
  source: "diagnostic" | "lesson" | "exercise" | "assessment" | "review";
  isCorrect: boolean;
  difficulty: 1 | 2 | 3;
  createdAt: Date;
}

export interface MasteryConfig {
  targetDifficulty: number;
  masteryStreak: number;
  diagnosticStreak: number;
  demoteToInProgressLapses: number;
}

export const DEFAULT_MASTERY_CONFIG: MasteryConfig = {
  targetDifficulty: 2,
  masteryStreak: 2,
  diagnosticStreak: 1,
  demoteToInProgressLapses: 2
};

export const EMPTY_MASTERY_STATE: MasteryState = {
  status: "unknown",
  consecutiveCorrectAtLevel: 0,
  totalCorrect: 0,
  totalAttempts: 0,
  lapses: 0,
  masteredAt: null,
  lastEvidenceAt: null
};

/** Pure incremental fold over new evidence (ordered by createdAt asc). Never re-scans history. */
export function applyEvidence(
  current: MasteryState,
  evidence: EvidenceInput[],
  cfg: MasteryConfig = DEFAULT_MASTERY_CONFIG
): MasteryState {
  let s = current;
  for (const e of evidence) s = foldOne(s, e, cfg);
  return s;
}

function foldOne(s: MasteryState, e: EvidenceInput, cfg: MasteryConfig): MasteryState {
  const atLevel = e.difficulty >= cfg.targetDifficulty;
  const next: MasteryState = {
    ...s,
    totalAttempts: s.totalAttempts + 1,
    totalCorrect: s.totalCorrect + (e.isCorrect ? 1 : 0),
    lastEvidenceAt: e.createdAt,
    consecutiveCorrectAtLevel: e.isCorrect
      ? atLevel
        ? s.consecutiveCorrectAtLevel + 1
        : s.consecutiveCorrectAtLevel
      : 0
  };
  const required =
    e.source === "diagnostic" ? cfg.diagnosticStreak : cfg.masteryStreak;

  switch (s.status) {
    case "unknown":
    case "inProgress": {
      if (next.consecutiveCorrectAtLevel >= required) {
        return { ...next, status: "mastered", masteredAt: e.createdAt };
      }
      return { ...next, status: "inProgress" };
    }
    case "mastered": {
      if (e.isCorrect) return next;
      return {
        ...next,
        status: "needsReview",
        consecutiveCorrectAtLevel: 0,
        lapses: s.lapses + 1
      };
    }
    case "needsReview": {
      if (next.consecutiveCorrectAtLevel >= cfg.masteryStreak) {
        return { ...next, status: "mastered", masteredAt: e.createdAt };
      }
      if (!e.isCorrect) {
        const lapses = s.lapses + 1;
        if (lapses >= cfg.demoteToInProgressLapses)
          return { ...next, status: "inProgress", lapses };
        return { ...next, lapses };
      }
      return next;
    }
  }
}
