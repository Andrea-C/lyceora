import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadModelsConfig, createRegistry, generateExercises, gradeAnswer, type Registry } from "@lyceora/agents";
import { getTopic } from "./content";
import type { AssessorPort } from "./services/session";

// Not `require.resolve("@lyceora/agents/config/models.yaml")`: Turbopack statically analyzes
// require.resolve() calls as module references and fails on the unrecognized .yaml extension
// ("Unknown module type"). A plain monorepo-relative fs path is ordinary runtime code to it.
const yamlPath = fileURLToPath(new URL("../../../../packages/agents/config/models.yaml", import.meta.url));
export const registry: Registry = createRegistry(loadModelsConfig(readFileSync(yamlPath, "utf-8")));

export const liveAssessor: AssessorPort = {
  generate: async (topicId, locale, difficulty, count) =>
    generateExercises(registry, getTopic(topicId), locale, { count, difficulty }),
  grade: (exercise, answer, locale, opts) => gradeAnswer(registry, exercise, answer, locale, opts)
};
