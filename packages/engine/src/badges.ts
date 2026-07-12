export interface BadgeSnapshot {
  totalXp: number; currentStreak: number; masteredCount: number; domainsCompleted: number;
  reviewsPassedTotal: number; cameBackAfterLapse: boolean; diagnosticCompleted: boolean; goalMetDays: number;
}
export interface BadgeDefinition { id: string; name: { it: string; en: string }; description: { it: string; en: string }; }

/** Copy rule: celebratory, never comparative or shaming (Risorse pedagogy). */
export const BADGE_DEFINITIONS: readonly BadgeDefinition[] = [
  { id: "primi-passi", name: { it: "Primi passi", en: "First steps" },
    description: { it: "Hai completato il tuo percorso di partenza.", en: "You completed your starting check-in." } },
  { id: "streak-3", name: { it: "Tre di fila", en: "Three in a row" },
    description: { it: "Tre giorni di studio di fila.", en: "Three study days in a row." } },
  { id: "streak-7", name: { it: "Una settimana!", en: "A full week!" },
    description: { it: "Sette giorni di fila: che costanza.", en: "Seven days in a row: great consistency." } },
  { id: "streak-14", name: { it: "Due settimane", en: "Two weeks" },
    description: { it: "Quattordici giorni di fila.", en: "Fourteen days in a row." } },
  { id: "streak-30", name: { it: "Un mese intero", en: "A whole month" },
    description: { it: "Trenta giorni di fila: straordinario.", en: "Thirty days in a row: extraordinary." } },
  { id: "prima-maestria", name: { it: "Prima maestria", en: "First mastery" },
    description: { it: "Hai padroneggiato il tuo primo argomento.", en: "You mastered your first topic." } },
  { id: "costellazione", name: { it: "Costellazione", en: "Constellation" },
    description: { it: "Hai completato tutti gli argomenti di un'area.", en: "You completed every topic in one area." } },
  { id: "ripasso-10", name: { it: "Memoria di ferro", en: "Iron memory" },
    description: { it: "Dieci ripassi superati.", en: "Ten reviews passed." } },
  { id: "rimonta", name: { it: "Rimonta", en: "Comeback" },
    description: { it: "Un argomento difficile è tornato tuo: gli errori insegnano.", en: "A tricky topic is yours again: mistakes teach." } },
  { id: "obiettivo-5", name: { it: "Cinque obiettivi", en: "Five goals" },
    description: { it: "Obiettivo XP raggiunto in cinque giornate.", en: "Daily XP goal met on five days." } }
] as const;

const CRITERIA: Record<string, (s: BadgeSnapshot) => boolean> = {
  "primi-passi": (s) => s.diagnosticCompleted,
  "streak-3": (s) => s.currentStreak >= 3,
  "streak-7": (s) => s.currentStreak >= 7,
  "streak-14": (s) => s.currentStreak >= 14,
  "streak-30": (s) => s.currentStreak >= 30,
  "prima-maestria": (s) => s.masteredCount >= 1,
  "costellazione": (s) => s.domainsCompleted >= 1,
  "ripasso-10": (s) => s.reviewsPassedTotal >= 10,
  "rimonta": (s) => s.cameBackAfterLapse,
  "obiettivo-5": (s) => s.goalMetDays >= 5
};

export function evaluateBadges(s: BadgeSnapshot, earned: ReadonlySet<string>): string[] {
  return BADGE_DEFINITIONS.filter((b) => !earned.has(b.id) && CRITERIA[b.id]!(s)).map((b) => b.id);
}
