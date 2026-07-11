import { z } from "zod";

/**
 * Storage contract for learning signals — snake_case in every language, per
 * .claude/skills/self-improving-agents/assets/agui/learning-signal.schema.json.
 * Captured now; consumed by the M3 distiller.
 */
export const learningSignalSchema = z.object({
  thread_id: z.string().min(1),
  run_id: z.string().min(1),
  actor: z.enum(["user", "agent"]),
  signal: z.enum(["correction", "approval", "rejection", "explicit_teach", "tool_result", "run_error"]),
  before: z.string().optional(),
  after: z.string().optional(),
  context: z.string().optional(),
  scope_hint: z.string().optional()
}).strict();
export type LearningSignal = z.infer<typeof learningSignalSchema>;
