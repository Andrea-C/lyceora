import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  loadModelsConfig, createRegistry, generateExercises, gradeAnswer, streamTeacher,
  createFakeAssessorPort, fakeTeacherDeltas,
  type Registry, type TeacherContext
} from "@lyceora/agents";
import { getTopic } from "./content";
import type { AssessorPort } from "./services/session";

// apps/web has no direct dependency on the `ai` package (only @lyceora/agents does) — derive the
// message type from streamTeacher's own signature rather than importing `ai` just for this type.
type ModelMessage = Parameters<typeof streamTeacher>[2][number];

// Not `require.resolve("@lyceora/agents/config/models.yaml")`: Turbopack statically analyzes
// require.resolve() calls as module references and fails on the unrecognized .yaml extension
// ("Unknown module type"). A plain monorepo-relative fs path is ordinary runtime code to it.
const yamlPath = fileURLToPath(new URL("../../../../packages/agents/config/models.yaml", import.meta.url));
export const registry: Registry = createRegistry(loadModelsConfig(readFileSync(yamlPath, "utf-8")));

/**
 * The ONE switch in the codebase between real model calls and the deterministic fakes
 * (packages/agents/src/fake.ts). Every model-backed server module goes through `liveAssessor` or
 * `teacherStream` below rather than calling @lyceora/agents directly, so flipping this env var
 * never touches route/service code — production code paths (LYCEORA_FAKE_MODELS unset) are
 * identical to before this switch existed. Set by Playwright's webServer
 * (apps/web/playwright.config.ts) so the whole product runs end-to-end with no provider API keys.
 */
const FAKE_MODELS = process.env.LYCEORA_FAKE_MODELS === "1";

const realAssessor: AssessorPort = {
  generate: async (topicId, locale, difficulty, count) =>
    generateExercises(registry, getTopic(topicId), locale, { count, difficulty }),
  grade: (exercise, answer, locale, opts) => gradeAnswer(registry, exercise, answer, locale, opts)
};

export const liveAssessor: AssessorPort = FAKE_MODELS ? createFakeAssessorPort() : realAssessor;

/**
 * POST /api/agent calls this instead of @lyceora/agents' streamTeacher directly, so the
 * fake/live branch stays confined to this file. Streams the same fixed teacher deltas through
 * whatever encoder the caller already uses (aguiSSE) when models are faked.
 */
export async function teacherStream(
  ctx: TeacherContext, messages: ModelMessage[], opts: { maxOutputTokens?: number } = {}
): Promise<{ textStream: AsyncIterable<string> }> {
  if (FAKE_MODELS) return { textStream: fakeTeacherStream(ctx.locale) };
  return streamTeacher(registry, ctx, messages, opts);
}

async function* fakeTeacherStream(locale: TeacherContext["locale"]): AsyncGenerator<string> {
  for (const delta of fakeTeacherDeltas(locale)) yield delta;
}
