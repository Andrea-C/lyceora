# TypeScript stack walkthrough

Build the self-improving agent architecture (SKILL.md §4–5) in TypeScript. This file maps
each component to concrete packages, config shapes, and bundled assets. It assumes you have
already run the decision trees and picked the TS variant — typically because the host project
is TS, or because a greenfield full-stack web app benefits from one language end-to-end
(shared types between the AG-UI frontend and the agent backend are a real advantage here:
the `RunAgentInput` and event types are literally the same imports on both sides).

Read `references/ag-ui-integration.md` first for the protocol contract; this file covers the
TS-specific wiring. The Python mirror is `references/python-stack.md` — a TS frontend against
a Python backend is a fully supported split (the wire format is identical; only the SDK field
casing differs, see below).

## Component map

| Component | TS choice | Bundled asset |
|---|---|---|
| AG-UI client | `@ag-ui/client` `HttpAgent` / `AbstractAgent` | `assets/agui/typescript/agent.ts` |
| AG-UI server | Express/Fastify/Next.js SSE route, or Mastra first-party | snippet below |
| Frontend + HITL capture | CopilotKit (or raw `HttpAgent`) | `assets/agui/typescript/capture-learning.ts` |
| Signal contract | JSON Schema (language-neutral) | `assets/agui/learning-signal.schema.json` |
| Provider routing | universal record behind `models.yaml` | `assets/config/models.yaml` |
| Memory tree | plain Markdown + git | `assets/memory/LAYOUT.md` + templates |
| Distiller worker | Node worker, port of the Python scaffold | `assets/learning-loop/distill.py` + `distiller-prompt.md` |
| Curation | deterministic linter (Python, runs anywhere) | `scripts/memory_lint.py` |

## Casing: the one interop rule to internalize

Wire enum values are SCREAMING_SNAKE_CASE (`TEXT_MESSAGE_CONTENT`) in every SDK. Field names
differ by SDK convention: **TS uses camelCase** (`threadId`, `runId`, `messageId`, `toolCallId`,
`toolCallName`, `delta`) while **Python uses snake_case** (`thread_id`, `run_id`, ...). The SDK
encoders normalize this on the wire, so a CopilotKit frontend talks to a FastAPI backend without
translation — but hand-rolled JSON must match what the consuming client expects. If you emit raw
SSE from a TS server to `@ag-ui/client`, emit camelCase.

One deliberate exception: the `LearningSignal` record (`assets/agui/learning-signal.schema.json`)
is snake_case (`thread_id`, `run_id`) **in every language**, because it is a schema-defined storage
contract consumed by the distiller, not an AG-UI SDK object. `capture-learning.ts` follows the
schema, not TS convention. Don't "fix" this — a single contract across capture, server, and
distiller is what makes the loop debuggable.

## AG-UI client and server

### Client: HttpAgent first, AbstractAgent only to wrap

`HttpAgent` from `@ag-ui/client` already speaks the standard endpoint contract (POST
`RunAgentInput`, consume the event stream). Subclass `AbstractAgent` only when wrapping a
framework that doesn't emit AG-UI events natively — run the framework inside `run()` and
translate its events (the middleware/adapter pattern). `run()` returns a factory producing an
rxjs `Observable<BaseEvent>`; the TS SDK's event handling is Observable-based rather than
generator-based as in Python. Both patterns are scaffolded in `assets/agui/typescript/agent.ts` —
copy it and fill in the translation, don't rewrite it.

### Server: adopt first-party if your framework has it, else a plain SSE route

Build-vs-adopt: if the project already uses Mastra (first-party AG-UI integration, one of the
most mature — its integration package versions past 1.x), or another framework from the
integration list (LangGraph, Pydantic AI, Agno, CrewAI, MS Agent Framework, Google ADK, AWS
Strands/AgentCore...), adopt its AG-UI endpoint and skip hand-rolling. Otherwise the contract is
small enough to implement directly: any HTTP endpoint that accepts a POST `RunAgentInput` and
returns a `BaseEvent` stream is AG-UI compatible. SSE has the widest client compatibility
(binary, WebSockets, and webhooks are also legal transports). Minimal Express shape:

```typescript
import express from "express";
import { EventType, RunAgentInput } from "@ag-ui/core";
import { randomUUID } from "node:crypto";

const app = express();
app.use(express.json());

app.post("/agent", async (req, res) => {
  const { threadId, runId } = req.body as RunAgentInput;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  const emit = (e: object) => res.write(`data: ${JSON.stringify(e)}\n\n`);

  emit({ type: EventType.RUN_STARTED, threadId, runId });
  try {
    const messageId = randomUUID();
    emit({ type: EventType.TEXT_MESSAGE_START, messageId, role: "assistant" });
    // Stream provider deltas, translating as you go:
    //   text delta      -> { type: TEXT_MESSAGE_CONTENT, messageId, delta }
    //   tool-call delta -> { type: TOOL_CALL_ARGS, toolCallId, delta }
    // Mirror agent-half learning signals (tool_result, run_error) into
    // learning/inbox/ as you emit — same inbox the frontend posts to.
    emit({ type: EventType.TEXT_MESSAGE_END, messageId });
    emit({ type: EventType.RUN_FINISHED, threadId, runId });
  } catch (err) {
    emit({ type: EventType.RUN_ERROR, message: String(err) });
  }
  res.end();
});
```

The same route works as a Fastify handler or a Next.js route handler returning a `ReadableStream`.
Add a second route, `POST /learning/signals`, that appends validated `LearningSignal` JSON lines
to `learning/inbox/signals-YYYY-MM-DD.jsonl` — mirror the Python version in
`assets/agui/python/server.py`; the responsibilities are identical.

Event-vocabulary caveat: docs cite "16/17 core events" for the classic five families, but the
current reference is ~28–30 including the newer REASONING_* and ACTIVITY_* families (THINKING_*
was removed at v1.0.0). Enumerate `EventType` from your installed `@ag-ui/core` version rather
than trusting any hardcoded list — including this one.

## Frontend: CopilotKit, and why approval tools are your learning capture

CopilotKit is the primary first-party AG-UI client (React, Angular, mobile, Slack). Two levers
matter for a self-improving agent:

- **`useFrontendTool({ name, parameters, handler, render })`** — parameters as a zod schema;
  `render` receives `{ status, args, result }` through the lifecycle phases
  `inProgress → executing → complete` (driven by TOOL_CALL_* events). The frontend supplies these
  tool definitions in `RunAgentInput.tools`; the agent "generates UI" by calling them; the
  frontend executes locally and returns a tool message.
- **Render agent state** — bind components to shared state streamed via
  STATE_SNAPSHOT / STATE_DELTA (RFC 6902 JSON-Patch deltas).

The reason frontend tools matter here goes beyond UI: **a frontend approval/confirmation tool is
human-in-the-loop, and HITL is the learning signal**. When the agent proposes an action and the
user approves, rejects, or edits it, the agent's attempt and the person's real decision land in
the *same event stream* — the interface is the only vantage point that sees both halves.
Screen-watching sees the human but not the agent; learning-from-chat sees words but not actions.
Wire every approval dialog, editable agent-filled field, and manual override through the capture
module:

```tsx
useFrontendTool({
  name: "approve_refund",
  parameters: z.object({ orderId: z.string(), amount: z.number(), reason: z.string() }),
  handler: async (args) => {
    const ok = await showApprovalDialog(args);
    (ok ? capture.approval : capture.rejection)(ids, toolCallId);   // -> /learning/signals
    return { approved: ok };
  },
  render: ({ status, args }) => <RefundCard phase={status} {...args} />,
});
```

`assets/agui/typescript/capture-learning.ts` provides the full capture surface (`approval`,
`rejection`, `fieldEdited` — diffed against the last agent-produced value tracked from
STATE_DELTA — `override`, `explicitTeach`). Copy it and wire it into your UI handlers; the
highest-value signal is `edit_after_output`, a user changing a value the agent filled in.

If you're not using React/CopilotKit, subscribe to the raw `HttpAgent` Observable and call the
same capture functions from your own handlers — the signal contract doesn't care.

## Provider layer

Three viable shapes, cheapest-adequate first:

1. **Direct SDKs behind the universal record** — `{provider, model, base_url, api_key, api_mode}`
   (the Hermes pattern). ~100+ providers collapse to three wire protocols
   (`anthropic_messages`, `chat_completions`, `openai_responses`/`gemini`), so one thin adapter
   per `api_mode` covers everything, including any OpenAI-compatible local endpoint. Most control,
   least dependency rot.
2. **Vercel AI SDK provider registry** — worth adopting when the project already uses the AI SDK;
   its registry plays the same role as the universal record. Keep `models.yaml` as the source of
   truth and construct registry entries from it, so routing stays a config edit, not a code edit.
3. **Framework built-ins** (Mastra model config etc.) — fine when you adopted the framework for
   the AG-UI endpoint anyway; verify you can still route background roles to cheap models
   independently of the main agent.

Whichever you pick, keep these semantics (they come from hard-won failure modes, not preference):

- **Refs and hierarchy**: `provider/model` strings split on the *first* slash
  (`openrouter/moonshotai/kimi-k2` → provider `openrouter`), resolved most-specific-wins:
  spawn-time override > per-agent > tier > defaults (as done in OpenClaw's
  `agents.list[].model` > `defaults.model.primary` > `fallbacks`).
- **Failover taxonomy**: walk the fallback chain on auth failures, rate limits, timeouts, and
  billing errors, with cooldowns (30s → 1m → 5m; billing failures disable for hours). Do NOT
  fail over on context overflow, user aborts, or safety refusals — those recur on the next
  provider and you'll burn the whole chain on an unfixable request. Session stickiness (stay on
  the resolved model once it works) prevents thrash.
- **Cost tiering**: distiller, curator, compression, title generation, and safety scanning run
  on cheap-tier auxiliary slots, never the orchestrator's model — both for cost and because
  background calls on the main model disturb its prompt cache.
- **OpenRouter**: supports provider routing preferences (e.g. sort by price) — put them in the
  provider's `extras`, not in code.
- **Local models**: Ollama defaults to a ~4k context window — always set `context_length`
  explicitly or long prompts silently truncate. vLLM needs
  `--enable-auto-tool-choice --tool-call-parser hermes` for tool calling.
- **Model IDs rot.** Any model name in config (including the ones shipped in
  `assets/config/models.yaml`) must be verified against the provider before first run.

## Config

`assets/config/models.yaml` is the canonical routing file: providers (universal records) →
tiers (named fallback chains) → agents/task_slots (role → tier). Load it in Node with the `yaml`
package; the role→tier indirection means swapping every cheap model is a one-line edit. If the
project standardizes on JSON5 (as OpenClaw does — comments matter in routing config, which is why
plain JSON is a poor fit), keep the same three layers and the same resolution order; the format
is incidental, the shape is not. Secrets are never inline: providers name an env var
(`api_key_env`), the runtime reads it. Precedence: CLI args > config file > `.env` > defaults.

## Sessions, episodic store, and frozen memory

- **Sessions**: persist full transcripts in SQLite (`better-sqlite3`) with an FTS5 index over
  message text — this is episodic recall as a *searchable* store, deliberately not in-context
  (the pattern behind Hermes `session_search`). A `search_sessions` tool over this index lets the
  agent pull a weeks-old precedent on demand instead of carrying it in every prompt.
- **Signals inbox**: append-only JSONL under `learning/inbox/`, one file per day, records
  validated against `assets/agui/learning-signal.schema.json`.
- **Memory tree**: scaffold from `assets/memory/LAYOUT.md` and the three templates. Load
  `MEMORY.md` files (app → team → user, narrowest last) **once at session start as a frozen
  snapshot** — read them into strings and never re-read mid-session. Writes surface next session.
  This is a cache economics rule, not a style rule: mutating the prompt prefix mid-conversation
  invalidates the provider's prefix cache on every subsequent call. Mechanics and write gating are
  in `references/memory-design.md`.

## Background distiller worker

Port `assets/learning-loop/distill.py` to a Node worker — the contract, not the code, is what you
are porting: read `learning/inbox/*.jsonl` + an index of existing lessons → call the model
resolved from the `distiller` role (cheap tier) with `assets/learning-loop/distiller-prompt.md`
→ parse the JSON proposal array → drop anything below confidence 0.5 → safety-scan (injection
phrases, exfiltration patterns, invisible Unicode `[​‌‍⁠﻿]`) → write
survivors under `memory/pending/<scope>/<type>/` → move processed inbox files aside so re-runs
are idempotent. Nothing in `pending/` is ever loaded into context; a human moving the file out
(git diff is the review UI) *is* the approval gate. Cadence per `assets/learning-loop/LOOP.md`:
distill hourly or on idle (OS cron or `node-cron` against `npx tsx workers/distill.ts`), lint
daily, curate weekly. Keep `scripts/memory_lint.py` as-is — it is deterministic, makes no API
calls, and Python-on-cron next to a Node service costs nothing.

## Verification: the synthetic-correction test

Prove the loop end-to-end before trusting it with real signals:

```bash
# 1. Inject a fake user correction (the schema is snake_case — see above)
curl -X POST http://localhost:8000/learning/signals -H "Content-Type: application/json" -d '{
  "thread_id": "th_test", "run_id": "run_test", "actor": "user", "signal": "correction",
  "before": "refused refund over $2,000", "after": "manager approved with reason",
  "context": "refund over limit", "scope_hint": "team/support"}'

# 2. Confirm capture, then distill on the cheap-tier role
cat learning/inbox/signals-$(date +%F).jsonl
npx tsx workers/distill.ts

# 3. Confirm the proposal is staged (and NOT loaded anywhere)
ls memory/pending/team/support/procedural/

# 4. Lint, review the diff, approve by moving the file
python scripts/memory_lint.py memory
git -C memory-repo mv memory/pending/team/support/procedural/proc-*.md \
    memory/team/support/procedural/          # then set status: approved

# 5. Start a NEW session; confirm the lesson pointer appears in loaded memory
#    and the git log shows the full audit trail: signal -> proposal -> approval.
```

If step 5 shows the lesson in the *current* session, your frozen-snapshot loading is broken;
if step 3 shows nothing, check the confidence threshold and the safety scan before suspecting
the model.

## Key sources

- AG-UI docs: https://docs.ag-ui.com/introduction · /concepts/events · /concepts/architecture · /concepts/agents · /concepts/tools · /quickstart/server
- AG-UI repo + Dojo examples: https://github.com/ag-ui-protocol/ag-ui
- CopilotKit: https://github.com/CopilotKit/CopilotKit · https://github.com/CopilotKit/generative-ui
- Hermes agent (universal provider record, auxiliary slots, guardrails): https://github.com/NousResearch/hermes-agent · https://hermes-agent.nousresearch.com/docs
- OpenClaw (JSON5 config, ref hierarchy, two-stage failover): https://github.com/openclaw/openclaw · https://docs.openclaw.ai
