import { streamText } from "ai";
import type { Registry } from "./registry.js";
import { buildTeacherSystemPrompt, type TeacherContext } from "./prompts/teacher.js";

export async function streamTeacher(
  reg: Registry, ctx: TeacherContext, messages: any[],
  opts: { maxOutputTokens?: number } = {}
): Promise<{ textStream: AsyncIterable<string> }> {
  return reg.withFallback("teacher", async ({ model }) => {
    const result = streamText({
      model, system: buildTeacherSystemPrompt(ctx), messages,
      maxOutputTokens: opts.maxOutputTokens ?? 1000
    });
    return { textStream: result.textStream };
  });
}
