import { parse } from "yaml";
import { z } from "zod";

const providerSchema = z.object({
  api_mode: z.enum(["anthropic_messages", "openai_responses", "gemini", "chat_completions"]),
  base_url: z.string().url().optional(),
  api_key_env: z.string()
});
const roleSchema = z.object({ tier: z.string().optional(), model: z.string().optional() });

const modelsConfigSchema = z.object({
  version: z.literal(1),
  providers: z.record(z.string(), providerSchema),
  tiers: z.record(z.string(), z.array(z.string()).min(1)),
  defaults: z.object({ tier: z.string() }),
  agents: z.record(z.string(), roleSchema),
  task_slots: z.record(z.string(), roleSchema).default({})
});
export type ModelsConfig = z.infer<typeof modelsConfigSchema>;
export type ProviderConfig = z.infer<typeof providerSchema>;

export function loadModelsConfig(yamlText: string): ModelsConfig {
  return modelsConfigSchema.parse(parse(yamlText));
}

/** Split "provider/model" on the FIRST slash: openrouter/deepseek/x -> [openrouter, deepseek/x] */
export function splitRef(ref: string): { provider: string; modelId: string } {
  const i = ref.indexOf("/");
  if (i < 0) throw new Error(`Invalid model ref (no slash): ${ref}`);
  return { provider: ref.slice(0, i), modelId: ref.slice(i + 1) };
}
