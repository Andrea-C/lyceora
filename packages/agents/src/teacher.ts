import { streamText, type ModelMessage } from "ai";
import type { Registry } from "./registry";
import { buildTeacherSystemPrompt, type TeacherContext } from "./prompts/teacher";

export async function streamTeacher(
  reg: Registry, ctx: TeacherContext, messages: ModelMessage[],
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
