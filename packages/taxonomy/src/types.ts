export type LocalizedText = { it: string; en: string };
export type TopicType =
  | "CONCEPTUAL" | "PROCEDURAL" | "REPRESENTATIONAL"
  | "DISPOSITIONAL" | "METACOGNITIVE" | "PSYCHOMOTOR";
export type Locale = keyof LocalizedText;

export interface Topic {
  id: string;
  type: TopicType;
  subject: string;
  domain: string;
  name: LocalizedText;
  description: LocalizedText;
  ageRangeStart: number;
  ageRangeEnd: number;
  centrality?: number;
  evidence: LocalizedText[];
  assessmentPrompt: LocalizedText;
  standards: string[];
}

export interface Dependency {
  topicId: string;
  prerequisiteId: string;
  strength: "hard" | "soft";
  reason: string;
}
