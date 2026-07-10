# AG-UI Integration — the Interface as Protocol and as Learning Source

Deep-dive companion to SKILL.md §3 (capture step) and §4 (reference architecture).
The body explains WHY the interface is the highest-value learning surface; this file
covers HOW: the AG-UI protocol contract, its event vocabulary, servers and clients in
both languages, generative UI, and — the part no other AG-UI doc covers — wiring the
event stream into a learning-capture pipeline your distiller can consume.

## Table of contents

1. [Where AG-UI sits — and why request-response fails agents](#1-where-ag-ui-sits--and-why-request-response-fails-agents)
2. [The three mechanisms](#2-the-three-mechanisms)
3. [Event vocabulary](#3-event-vocabulary)
4. [The core contract](#4-the-core-contract)
5. [Server side (Python / FastAPI)](#5-server-side-python--fastapi)
6. [Client side (TypeScript) and the adapter pattern](#6-client-side-typescript-and-the-adapter-pattern)
7. [Generative UI — three patterns](#7-generative-ui--three-patterns)
8. [Frontend tools as human-in-the-loop](#8-frontend-tools-as-human-in-the-loop)
9. [The event stream as learning-capture source](#9-the-event-stream-as-learning-capture-source)
10. [Worked example: the refund override as an event trace](#10-worked-example-the-refund-override-as-an-event-trace)
11. [Integration landscape](#11-integration-landscape)
12. [Key sources](#12-key-sources)

---

## 1. Where AG-UI sits — and why request-response fails agents

Three complementary protocols divide the agent-connectivity problem; do not treat
them as competitors or pick one "instead of" another:

| Protocol | Connects | Use it for |
|---|---|---|
| MCP | agent ↔ tools/data | Giving agents capabilities (see capabilities.md) |
| A2A | agent ↔ agent | Delegation between independent agent systems |
| AG-UI | agent ↔ user/frontend | Streaming agent work to people and capturing what they do about it |

AG-UI (Agent–User Interaction Protocol, stewarded by CopilotKit) exists because
REST/GraphQL request-response is structurally wrong for agents: agents are
long-running (a response may take minutes), stream intermediate work (partial text,
tool calls in flight), are nondeterministic, mix structured and unstructured output,
and need human-in-the-loop pauses mid-run. A request-response API forces you to
either block, poll, or invent an ad-hoc SSE format — and every ad-hoc format loses
the property this skill cares about most: a *typed, replayable record of everything
the agent and the user did*, which is exactly what a learning loop distills from.

That last point is the reason this skill standardizes on AG-UI rather than a custom
WebSocket format: the protocol gives you learning capture almost for free, because
agent actions and user reactions already flow through one typed stream (§9).

## 2. The three mechanisms

AG-UI provides three coordination mechanisms; a self-improving agent uses all three:

1. **Event emission** — the agent emits typed JSON events (text deltas, tool calls,
   lifecycle markers). This is the agent-trace half of your learning signal.
2. **State synchronization** — agent and frontend share a state object, kept in sync
   via `STATE_SNAPSHOT` (full replace) and `STATE_DELTA` (RFC 6902 JSON-Patch
   arrays). Deltas matter for learning capture: when the agent patches
   `/invoice/amount` and the user later edits that same field, the diff between
   agent-set and user-final value is a correction signal (§9).
3. **Generative UI** — the agent drives what the frontend renders (§7). This is also
   how you place approval/rejection controls in front of users, which is how
   decisions become capturable events instead of out-of-band phone calls.

## 3. Event vocabulary

All events extend `BaseEvent` (`type`, optional `timestamp`, optional `rawEvent`).
Naming conventions — get these right or events silently fail validation:

- Wire enum values: `SCREAMING_SNAKE_CASE` (e.g. `TEXT_MESSAGE_CONTENT`).
- Class names: PascalCase (`TextMessageContentEvent`).
- Field names: **snake_case in the Python SDK** (`thread_id`, `message_id`,
  `tool_call_name`), **camelCase in TypeScript** (`threadId`, `messageId`,
  `toolCallName`). Mixing these up is the most common first-hour bug.

Event families:

| Family | Events | Notes |
|---|---|---|
| Lifecycle (5) | `RUN_STARTED` (thread_id, run_id), `RUN_FINISHED`, `RUN_ERROR` (message), `STEP_STARTED`, `STEP_FINISHED` | Pattern: `RUN_STARTED → (STEP_STARTED → STEP_FINISHED)* → RUN_FINISHED \| RUN_ERROR` |
| Text message (3+1) | `TEXT_MESSAGE_START` (message_id, role), `TEXT_MESSAGE_CONTENT` (delta), `TEXT_MESSAGE_END`; `TEXT_MESSAGE_CHUNK` convenience | Chunk collapses start/content/end for simple streaming |
| Tool call (4+1) | `TOOL_CALL_START` (tool_call_id, tool_call_name), `TOOL_CALL_ARGS` (delta), `TOOL_CALL_END`, `TOOL_CALL_RESULT` (content); `TOOL_CALL_CHUNK` convenience | `TOOL_CALL_RESULT` is a primary learning-capture anchor |
| State (3) | `STATE_SNAPSHOT` (snapshot), `STATE_DELTA` (RFC 6902 patch array), `MESSAGES_SNAPSHOT` | Deltas keep payloads small and diffs capturable |
| Special (2) | `RAW`, `CUSTOM` (name, value) | `CUSTOM` carries app-specific signals: agent handoffs, generative-UI specs, override markers |
| Reasoning (newer) | `REASONING_START/END`, `REASONING_MESSAGE_START/CONTENT/END/CHUNK`, `REASONING_ENCRYPTED_VALUE` | Replaces the deprecated `THINKING_*` family, removed in v1.0.0 |
| Activity (newer) | `ACTIVITY_SNAPSHOT`, `ACTIVITY_DELTA` | |

**Count caveat:** docs variously cite "16/17 core events" (the classic five
families) while the full current reference lists ~28–30 including Reasoning and
Activity. Packages also version independently (some integrations >1.x, others still
0.0.x). Do not hardcode assumptions about the event set — verify against the SDK
version actually installed (`pip show ag-ui-protocol` / the `@ag-ui/*` versions in
package.json) and tolerate unknown event types in any consumer you write. Your
learning-signal pipeline in particular must skip-not-crash on unrecognized events,
because the protocol will grow under it.

## 4. The core contract

The entire protocol reduces to one function signature:

```
run(input: RunAgentInput) -> stream of BaseEvent
```

— an Observable in TypeScript, an (async) generator in Python. `RunAgentInput`
fields (camelCase shown; Python uses snake_case):

| Field | Purpose |
|---|---|
| `threadId` | Conversation identity across runs — your session key |
| `runId` | This invocation — the join key for learning signals |
| `messages` | Conversation history |
| `state` | Shared frontend↔agent state object |
| `tools` | **Frontend-provided** tool definitions with JSON-Schema parameters (§8) |
| `context` | Additional contextual data from the app |
| `forwardedProps` | Arbitrary passthrough |

**Compatibility rule:** any HTTP endpoint that accepts a POSTed `RunAgentInput` and
returns a `BaseEvent` stream is AG-UI compatible. There is no registration, no
handshake, no vendor lock — which is why the memory/learning layer you build stays
portable across frameworks (a lesson learned from deployments sharing one memory
store across multiple agent frameworks; see learning-layers.md on portability).

Transports: HTTP SSE (widest compatibility — default to it), HTTP binary,
WebSockets, webhooks. The `EventEncoder` (Python) negotiates via the request's
`Accept` header, so write your endpoint transport-agnostic and let the encoder pick.

## 5. Server side (Python / FastAPI)

Scaffold from `assets/agui/python/server.py` — it is structurally complete and
carries two responsibilities on purpose: the standard `/agent` run endpoint AND a
`/learning/signals` inbox endpoint (§9). Do not scaffold the run endpoint alone; the
learning half is why you are here. The shape:

```python
from ag_ui.core import (RunAgentInput, EventType, RunStartedEvent,
                        RunFinishedEvent, RunErrorEvent, TextMessageChunkEvent)
from ag_ui.encoder import EventEncoder

@app.post("/agent")
async def agent_endpoint(input_data: RunAgentInput, request: Request):
    encoder = EventEncoder(accept=request.headers.get("accept"))
    async def gen():
        try:
            yield encoder.encode(RunStartedEvent(type=EventType.RUN_STARTED,
                thread_id=input_data.thread_id, run_id=input_data.run_id))
            # ... call your provider, translate its deltas:
            #   text delta      -> TextMessageChunkEvent(message_id=..., delta=...)
            #   tool-call delta -> ToolCallChunkEvent(tool_call_id=...,
            #                        tool_call_name=..., delta=...)
            yield encoder.encode(RunFinishedEvent(type=EventType.RUN_FINISHED,
                thread_id=input_data.thread_id, run_id=input_data.run_id))
        except Exception as e:
            yield encoder.encode(RunErrorEvent(type=EventType.RUN_ERROR, message=str(e)))
    return StreamingResponse(gen(), media_type=encoder.get_content_type())
```

Why this shape:

- **Always bracket with lifecycle events**, and emit `RUN_ERROR` from the `except`
  path rather than letting the stream die silently — clients (and your signal log)
  need a terminal event to distinguish "finished" from "connection lost".
- **Translate provider deltas inside the generator.** The provider client is
  resolved through your model config (`assets/config/models.yaml`,
  `agents.orchestrator` → tier chain), not hardcoded — model IDs rot, so keep them
  in config where one edit fixes every endpoint. Any OpenAI-compatible client works
  when the resolved provider's `api_mode` is `chat_completions`.
- **Forward `input_data.tools` to the model.** These are the frontend's tools; if
  you drop them, you lose generative UI and HITL capture in one stroke (§8).
- Discrete state emission when the agent updates shared state:

```python
yield encoder.encode(StateDeltaEvent(type=EventType.STATE_DELTA,
    delta=[{"op": "replace", "path": "/invoice/amount", "value": 2000}]))
```

Frameworks with first-party AG-UI support (Pydantic AI, LangGraph — see §11) give
you this endpoint prebuilt; prefer that and keep only the signal-inbox half custom.

## 6. Client side (TypeScript) and the adapter pattern

Scaffold from `assets/agui/typescript/agent.ts`. Two classes cover almost every case:

- **`HttpAgent`** — concrete client for any standard AG-UI endpoint. If your server
  follows §5, this one line is your whole client:

```typescript
import { HttpAgent } from "@ag-ui/client";
export const agent = new HttpAgent({ url: "http://localhost:8000/agent" });
```

- **`AbstractAgent`** — subclass it only when wrapping something that is NOT already
  AG-UI (a legacy in-process framework, a proprietary streaming API). This is the
  **middleware/adapter pattern**: run the native framework inside `run()` and
  translate its native events into AG-UI events on an Observable:

```typescript
import { AbstractAgent, RunAgentInput, BaseEvent, EventType } from "@ag-ui/client";
import { Observable } from "rxjs";

export class WrappedAgent extends AbstractAgent {
  run(input: RunAgentInput) {
    const { threadId, runId } = input;   // camelCase in TS
    return () => new Observable<BaseEvent>((observer) => {
      observer.next({ type: EventType.RUN_STARTED, threadId, runId } as BaseEvent);
      // ... invoke native framework; map its callbacks to TEXT_MESSAGE_* / TOOL_CALL_* ...
      observer.next({ type: EventType.RUN_FINISHED, threadId, runId } as BaseEvent);
      observer.complete();
    });
  }
}
```

The adapter pattern is also your migration path: wrap the existing system today,
capture learning signals immediately, and swap the internals later without touching
the frontend or the distiller — both only ever see AG-UI events.

## 7. Generative UI — three patterns

AG-UI is a runtime coordination protocol, not a UI markup language. Three patterns,
ordered by how much control the frontend keeps:

1. **Controlled / static** (frontend keeps control): the frontend pre-builds
   components; the agent picks one and supplies its data via a tool call. Carried on
   `TOOL_CALL_*` events, with render phases bound to the call lifecycle
   (inProgress → executing → complete). Choose this for anything users act on —
   approval cards, editable forms — because pre-built components give you reliable
   hooks to capture what the user did (§9).
2. **Declarative** (shared control): the agent returns a structured spec (cards,
   lists, form schemas) and the frontend renders the JSON. Carried on
   `STATE_SNAPSHOT`/`STATE_DELTA` plus `CUSTOM`. Choose when layouts vary too much
   to pre-build but you still want a schema between agent and pixels.
3. **Open-ended** (agent keeps control): the agent emits a full UI surface
   (HTML/iframe/MCP-Apps style) via `CUSTOM`. Maximum freedom, weakest capture hooks
   — user interactions inside an agent-authored blob are hard to diff against agent
   intent. Avoid for decision surfaces.

CopilotKit (the primary first-party frontend client — React, Angular, mobile, Slack)
exposes these as two levers:

- `useFrontendTool({ name, parameters, handler, render: ({status, args, result}) => ... })`
  — registers a frontend tool AND its lifecycle-phased renderer in one place.
- **Render agent state** — bind components to the shared state object streamed via
  `STATE_SNAPSHOT`/`STATE_DELTA`, so agent progress renders without bespoke wiring.

## 8. Frontend tools as human-in-the-loop

The mechanism that makes AG-UI a learning surface: the **frontend** defines tools
and passes them in `RunAgentInput.tools` (JSON-Schema parameters, same shape as any
tool def). The agent calls them like server tools; the frontend executes locally and
returns a tool message.

Human-in-the-loop is this exact flow with a person inside the handler: define an
`approve_refund` frontend tool whose handler renders an approval card and resolves
with the human's decision. No new protocol machinery — approval is just a tool call
whose executor is a human.

Why this matters for self-improvement: the human's decision now arrives as a typed,
timestamped event **in the same stream** as the agent's proposal, carrying the
`tool_call_id` that links decision to proposal. Compare with the two broken
alternatives from learning-layers.md: screen-watching sees the human but not the
agent's reasoning; chat-log mining sees words but not actions. The interface sees
both halves — that is the whole thesis, made concrete as a tool schema.

## 9. The event stream as learning-capture source

This section is the reason this reference exists. Everything above is standard
AG-UI; here is how to turn it into the capture step of the learning loop
(capture → distill → apply → verify → curate — normative spec in
`assets/learning-loop/LOOP.md`).

**Architecture: two producers, one inbox, one consumer.**

```
frontend (user half)  ──POST /learning/signals──┐
                                                ├─→ learning/inbox/signals-YYYY-MM-DD.jsonl
server (agent half)   ──log_signal() mirror────┘            │
                                                            ▼
                                     distiller (cheap model, scheduled)
                                     assets/learning-loop/distill.py
```

**The contract is a schema, not a library:** `assets/agui/learning-signal.schema.json`
defines one normalized `LearningSignal` record — `ts`, `thread_id`, `run_id`,
`actor` (user/agent/system), `signal` (correction | approval | rejection | override |
edit_after_output | tool_result | run_error | explicit_teach), optional
`before`/`after`, `scope_hint`, and `event_refs` back to the AG-UI events it derives
from. Frontend, server, and distiller all speak this schema and nothing else, which
is what lets you swap any of the three independently.

**Frontend producer** — scaffold from `assets/agui/typescript/capture-learning.ts`.
Its two jobs, in order of value:

1. Track what the agent set (subscribe to `STATE_DELTA`, remember each patched
   path's value), so that when the user edits that field you can emit
   `edit_after_output` with a real `before`/`after` diff. A user silently fixing the
   agent's output is the highest-value signal there is, and it is invisible unless
   you recorded what the agent wrote first.
2. Wire explicit UI actions to signals: approval/rejection buttons on tool-call
   cards (`event_refs: [toolCallId]`), an override path for "human did manually what
   the agent refused," and an `explicit_teach` path for "remember this."

**Server producer** — the same `server.py` mirrors agent-half signals
(`tool_result`, `run_error`) into the same inbox as it streams. Persist at the
point of emission, not from a frontend replay: the server sees runs that error out
before the frontend renders anything.

**Persistence discipline:** append-only JSONL, one file per day, moved to
`processed/` after distillation (idempotent re-runs). Capture is cheap — never
throttle it, and never let capture volume leak into the agent's context. Deciding
what deserves memory is the distiller's job (on the cheap-tier `distiller` role from
`assets/config/models.yaml`), not the capture layer's and not the orchestrator's.

**Provenance:** signals carry `event_refs`; distilled lessons carry `source_events`
({thread, run, event}) in their frontmatter (see `assets/memory/lesson.template.md`).
This chain — lesson → signal → AG-UI event — is what makes a learned rule auditable
("why does the agent believe this?") and safely revertable.

## 10. Worked example: the refund override as an event trace

The refund scenario from SKILL.md §3, spelled out at the wire level. Agent has a
$2,000 auto-approval limit; a $5,000 refund arrives; a manager approves it manually.

Run `run_113` (agent half — streamed by the server, mirrored to the inbox):

```
RUN_STARTED        thread_id=th_9f2c run_id=run_113
TOOL_CALL_START    tool_call_id=tc_1 tool_call_name=lookup_order
TOOL_CALL_ARGS     delta='{"order_id": "ORD-4821"}'
TOOL_CALL_END      tool_call_id=tc_1
TOOL_CALL_RESULT   content='{"total": 5000, "refund_eligible": true}'
   → inbox: {actor: "agent", signal: "tool_result", event_refs: ["TOOL_CALL_RESULT"]}
TEXT_MESSAGE_CHUNK "I can't process this refund — it exceeds the $2,000 limit."
RUN_FINISHED
```

Then the human half — the manager processes the refund manually in the UI. The
frontend's `capture.override(...)` posts:

```json
{"thread_id": "th_9f2c", "run_id": "run_114", "actor": "user",
 "signal": "override", "before": "refused", "after": "approved",
 "context": "refund ORD-4821 $5000; reason: long-standing enterprise customer",
 "scope_hint": "team/support", "event_refs": ["CUSTOM/USER_OVERRIDE"]}
```

No automatic test could grade this — only the manager's real decision, and it is now
on disk next to the agent's refusal, joined by thread and run ids. The scheduled
distiller reads both, recognizes refusal-followed-by-override, and proposes a
procedural lesson to `memory/pending/team/support/procedural/` citing both events as
`source_events` — gated, never auto-applied, per the loop rules in LOOP.md. Next
similar case, the agent routes to the approvals queue instead of refusing.

Use this exact scenario as your end-to-end verification: inject the synthetic
signals, run the distiller, confirm a pending lesson appears with correct
provenance (SKILL.md §10).

## 11. Integration landscape

First-party AG-UI integrations shipping (mid-2026): **Mastra, Pydantic AI,
LangGraph, Agno, LlamaIndex, AG2, CrewAI, Microsoft Agent Framework, Google ADK,
AWS Strands, AWS Bedrock AgentCore**. In progress: AWS Bedrock Agents, OpenAI Agents
SDK, Cloudflare Agents, Flowise, Langflow. Language SDKs: TypeScript, Python,
Kotlin, Java, Go, Rust, Dart, Ruby, C++ (.NET and Nim in progress).

Practical guidance:

- If the host project already uses a framework on this list, **adopt its first-party
  integration** instead of hand-writing the §5 endpoint — you inherit protocol
  updates for free. Your custom code shrinks to the signal inbox and the frontend
  capture module, which no framework ships.
- The **AG-UI Dojo** (`apps/dojo` in the protocol repo) holds 50–200 line runnable
  examples per feature. This skill deliberately bundles no runnable demo app —
  bundled apps rot; the Dojo is maintained upstream. Point users there for working
  end-to-end references and keep the bundled assets (`assets/agui/*`) as the
  adapt-and-copy layer.
- Framework-agnosticism is a strategic property, not a convenience: because the
  learning pipeline consumes AG-UI events and LearningSignal records rather than any
  framework's internals, the memory it builds is portable — the pattern of one
  memory store serving agents on multiple frameworks simultaneously (as reported in
  CopilotKit + Google ADK + Microsoft Agent Framework deployments) only works
  because capture happens at the protocol layer.

## 12. Key sources

- AG-UI docs: https://docs.ag-ui.com/introduction — concepts: /concepts/events,
  /concepts/architecture, /concepts/agents, /concepts/tools; server quickstart:
  /quickstart/server
- Protocol repo (spec + Dojo): https://github.com/ag-ui-protocol/ag-ui
- CopilotKit (first-party frontend client): https://github.com/CopilotKit/CopilotKit
  and https://github.com/CopilotKit/generative-ui
- Microsoft Agent Framework AG-UI integration:
  https://learn.microsoft.com/en-us/agent-framework/integrations/ag-ui/
- AWS Bedrock AgentCore + AG-UI generative UI:
  https://aws.amazon.com/blogs/machine-learning/build-generative-ui-for-ai-agents-on-amazon-bedrock-agentcore-with-the-ag-ui-protocol/
