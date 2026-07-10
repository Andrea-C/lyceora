---
name: self-improving-agents
description: >
  Build self-improving AI agents that learn from their users. Covers the full
  architecture: AG-UI protocol for streaming agent↔user events and generative UI,
  model-agnostic provider config (Anthropic, OpenAI, Google, OpenRouter, local
  Ollama/vLLM), per-agent and per-subagent model tiering, memory and skills that
  grow over time, and safety-gated self-writes — with ready-to-copy Python and
  TypeScript templates. Use when asked to build, design, scaffold, or improve an
  AI agent or agent product that should learn from usage, remember across
  sessions, capture user corrections and approvals, stream agent events to a
  frontend (AG-UI, CopilotKit), support multiple or local LLM providers, assign
  cheaper models to subagents or background tasks, or extend an agent with custom
  tools, MCP servers, or skills. Also use for any question about agent memory
  design, self-learning loops, agent harness architecture, or "make my agent get
  better over time."
---

# Self-Improving Agents

A self-improving agent is one whose **context** (memory + skills) and **harness**
(loop, tools, checks) get better from real usage — with the model's weights
untouched. The highest-value learning signal is almost never an automatic score:
it is the decisions real users make while working alongside the agent. A person's
real decision is the one signal that can't be faked; an automatic score can be.
This skill teaches you to build agents that capture that signal at the interface,
distill it into durable memory and skills, and apply it safely.

## When to use this skill

- Building a new agent or agent product that should learn from usage
- Retrofitting learning (memory, skills, correction capture) onto an existing agent
- Adding an AG-UI event stream / frontend to an agent
- Making an agent model-agnostic, or assigning different models to different roles

Out of scope: fine-tuning or weight updates. That layer needs a free, trustworthy
score and training infrastructure — it belongs to model labs, not products
(see `references/learning-layers.md` for why).

## The three learning layers

Every agent system has three layers, and each can improve independently:

| Layer | What changes | How it learns | Where it runs |
|---|---|---|---|
| **Model** | the weights | trains on its own runs, where a computer can score results for free | research labs |
| **Harness** | loop, tools, prompts, checks | rewrites itself from execution traces | products, today |
| **Context** | memory + skills (plain text) | distills what worked into text the next run reads | products — and the ONLY layer that learns from users |

(You already use all three in Claude Code: the model is Claude, the harness is
Claude Code itself, the context is CLAUDE.md and skills.)

There are two sources of learning signal, and each alone sees half:
**agent traces** (what the agent did, where it failed — but blind to what users
do) and **user activity** (clicks, edits, corrections — but blind to what the
agent tried). One surface sees both simultaneously: **the interface where user
and agent work side by side**. That is what the AG-UI protocol standardizes —
every tool call, state change, approval, and edit flows through one event
stream, so the agent's miss and the person's fix land in the same place.

Deep-dive with named systems and their results: `references/learning-layers.md`.

## The learning loop

Every build in this skill implements the same five-stage loop:

```
capture ──> distill ──> apply ──> verify ──> curate
   │           │           │         │          │
 AG-UI      cheap bg    write to   tests /   staleness,
 event      model       the right  human     decay,
 stream     drafts      store +    gate      consolidation
 (traces +  lessons     scope
  user
  actions)
```

1. **Capture** — persist the AG-UI event stream: agent tool calls and results,
   plus user corrections, approvals, rejections, overrides, and edits. Both
   halves land as JSONL learning signals in one inbox. Capture is cheap and
   continuous; never let capture volume dictate context size.
2. **Distill** — a background agent on a *cheap* model reads the inbox and
   drafts candidate lessons, each typed as semantic (fact), episodic (case),
   or procedural (workflow), each citing the source events it derives from.
3. **Apply** — write the lesson to the right store at the narrowest scope
   (per-user / per-team / per-app). Agent-drafted lessons go to a `pending/`
   staging area, never directly into live memory.
4. **Verify** — scan every self-write for injection; run tests when they exist;
   require human approval for procedural rules and anything above user scope.
   Never let the agent that wrote a lesson grade its own lesson.
5. **Curate** — lint for staleness (`review_by` dates, hit counts), consolidate
   duplicates, expire what stopped helping, compress capped memory files.

Worked example, threaded through this whole skill: a support agent refuses a
$5,000 refund because policy caps refunds at $2,000. A manager overrides it by
hand — loyal customer, third late delivery. The override fires through the app
as AG-UI events (capture). The nightly distiller reads the trace and drafts a
procedural lesson: "over-limit refund for a loyal customer after repeat
failures → escalate with reason, don't refuse" (distill). It lands in
`pending/team/support/procedural/` (apply). The support lead approves it
(verify). The next similar case is handled the way the manager decided —
and if the policy changes, the lesson's `review_by` date forces re-review
(curate). Nothing was retrained.

Loop mechanics and cadences: `assets/learning-loop/LOOP.md` (normative).
Store design: `references/memory-design.md`. Capture wiring: `references/ag-ui-integration.md`.

## Reference architecture

```
┌───────────────────────┐   AG-UI events (SSE)   ┌─────────────────────────────┐
│ Frontend              │ <────────────────────── │ AG-UI endpoint              │
│ (CopilotKit / AG-UI   │   RunAgentInput (POST)  │ (FastAPI / Express / ...)   │
│  client)              │ ──────────────────────> │                             │
│  • renders events     │                         │  ┌───────────────────────┐  │
│  • captures user      │   learning signals      │  │ Agent core            │  │
│    corrections,       │ ──────────────────────> │  │ loop · tool registry  │  │
│    approvals, edits   │   POST /learning/signals│  │ MCP clients · skills  │  │
└───────────────────────┘                         │  └──────────┬────────────┘  │
                                                  └─────────────┼───────────────┘
                        ┌───────────────────┐                   │
                        │ Provider layer    │ <─────────────────┤
                        │ models.yaml:      │                   │
                        │ tiers, fallbacks, │        ┌──────────▼───────────┐
                        │ role assignments  │        │ Memory store         │
                        └────────┬──────────┘        │ markdown scopes +    │
                                 │                   │ session DB (episodic)│
                        ┌────────▼──────────┐        └──────────▲───────────┘
                        │ Background learner│                   │
                        │ distiller+curator │ ──── pending/ ────┘
                        │ (cheap tier)      │      (human gate)
                        └───────────────────┘
```

One constraint shapes everything: **keep the prompt cache stable**. Assemble
context in three tiers — stable (identity, tool guidance) → contextual (skills,
project files) → volatile (memory snapshot, timestamps) — and never mutate the
earlier tiers mid-conversation. Memory loads as a frozen snapshot at session
start; writes surface next session. This is why the distiller runs on its own
model slot and why memory edits are staged rather than live.

## Workflow

Follow these steps in order when invoked:

1. **Assess the host project.** Detect the language/stack (package.json vs
   pyproject.toml), any existing agent framework (LangGraph, Pydantic AI,
   Mastra, CrewAI, plain SDK...), any existing frontend, and where users
   currently interact with the agent. If the framework has first-party AG-UI
   support, adopt its integration instead of building a raw endpoint.
2. **Establish what "improving" means here.** What does the agent do, what goes
   wrong, who corrects it today, and what signal exists (traces? user edits?
   approvals?). If no signal exists yet, design the capture surface first —
   there is nothing to learn from otherwise.
3. **Pick the learning layer(s)** with Tree 1 below. Record the choice and the
   rationale. Default: Context, plus a harness verification loop if an
   automatic grader genuinely exists.
4. **Pick the stack variant** (see Stack selection) and read the matching
   reference — `references/python-stack.md` or `references/typescript-stack.md` —
   plus `references/ag-ui-integration.md`.
5. **Scaffold from the assets in dependency order:**
   1. provider config → copy `assets/config/models.yaml`, prune unused
      providers, verify model IDs are current, map roles to tiers
   2. AG-UI endpoint with event persistence → `assets/agui/`
      (`learning-signal.schema.json` is the normative contract linking
      frontend capture, server, and distiller — keep all three aligned to it)
   3. memory layout → `assets/memory/LAYOUT.md` (the contract) + templates
   4. tool / MCP / skill surface → `assets/capability-extension/`
   5. background distiller on the cheap tier → `assets/learning-loop/`
6. **Wire gating BEFORE enabling writes:** the self-write scanner, `pending/`
   staging, scope config, and audit log. The system must never go live with
   ungated agent self-writes — a poisoned memory write is a persistent jailbreak.
7. **Verify end-to-end** with the synthetic-correction test (see Verification),
   then hand the user the curation cadence: review `pending/` as it fills, run
   `scripts/memory_lint.py` daily, curate weekly.

## Decision trees

### Tree 1 — Which learning layer?

```
Can a computer score the result for free and trustworthily (code, math, tests)?
├─ NO (support/sales/ops — most products) → CONTEXT layer. Users are your grader.
└─ YES → Do you also control the harness code?
    ├─ YES → HARNESS layer too: verification loop + trace-driven rewrites
    │        (human-approved first; fully automatic only with a held-out check).
    └─ NO  → CONTEXT layer only.
Model layer (weights)? → Almost never. Needs a free score AND training infra.
Default: build Context first — the only layer that learns from users, and
portable across models and harnesses.
```

### Tree 2 — Which memory kind for this lesson?

```
Stable fact about the world/user/account?  → SEMANTIC
  (record source + last_verified; facts go stale silently)
Specific thing that happened once?         → EPISODIC
  (searchable log, NOT always-in-context; curate hard — most cases are noise)
Rule/workflow for handling a case?         → PROCEDURAL
  (highest value AND highest risk: a wrong workflow is confidently wrong every
   time → require provenance + repetition or approval before promotion;
   multi-step + tool-using → distill into a skill)
Unclear? → store episodic now; promote to procedural only after it repeats.
```

### Tree 3 — Custom tool vs MCP server vs skill?

```
Executable capability (calls an API, touches files, computes)?
├─ Only this agent, latency-sensitive, in-process → CUSTOM TOOL (registry)
├─ External system / shared across agents / third-party → MCP SERVER
└─ Not executable — know-how (procedure + pitfalls)     → SKILL
Composite workflow over existing tools? → SKILL that references the tools.
Other agents should use YOUR agent?     → expose it as an MCP server.
```

Full matrix with tradeoffs: `assets/capability-extension/decision-matrix.md`.

### Tree 4 — Which model tier per role?

```
Main orchestrator (plans, talks to user)      → STRONG tier + fallback chain
Subagent workers (bounded, well-specified)    → CHEAP/STANDARD tier
                                                (spawn-time override for the
                                                 rare hard task)
Background jobs (distiller, compression,
  titles, safety screening)                   → CHEAP auxiliary slots — never
                                                the main model (cost + cache
                                                stability)
Privacy-sensitive learning over user data     → LOCAL tier (Ollama/vLLM)
Rule: default cheap, escalate on evidence; every role gets a fallback chain.
```

Config template: `assets/config/models.yaml`. Provider abstraction, failover
taxonomy, local-model gotchas: `references/model-providers.md`.

### Tree 5 — Gating and scope for a self-write?

```
Who wrote it?
├─ User explicitly ("remember X") → scan → apply directly, narrowest scope
└─ Agent/distiller →
    scan (injection / exfiltration / invisible Unicode) → FAIL = block + log
    ├─ Semantic or episodic note, user scope → auto-apply allowed, audit-log it
    ├─ Procedural rule or skill              → STAGE in pending/, human approves
    └─ Anything team- or app-scoped          → ALWAYS human-approved
Scope: personal preference → user/; approval procedure → team/;
company-wide rule → app/. When unsure, narrowest scope.
```

## Stack selection

Follow the host project. If it has a Python backend, use the Python variant;
if it is TypeScript end-to-end (or greenfield full-stack web), use the
TypeScript variant; a Python backend with a React/CopilotKit frontend is the
most common hybrid and uses both.

| Task | Read | Copy from |
|---|---|---|
| Python agent backend (FastAPI + ag-ui SDK) | `references/python-stack.md` | `assets/agui/python/`, `assets/learning-loop/` |
| TypeScript agent / frontend (CopilotKit) | `references/typescript-stack.md` | `assets/agui/typescript/` |
| Protocol details, generative UI, HITL | `references/ag-ui-integration.md` | `assets/agui/learning-signal.schema.json` |
| Model routing + failover | `references/model-providers.md` | `assets/config/models.yaml` |
| Memory stores + scopes + curation | `references/memory-design.md` | `assets/memory/` |
| Tools, MCP, skills, self-authoring | `references/capabilities.md` | `assets/capability-extension/` |

Note the SDK naming split: AG-UI Python uses snake_case fields (`thread_id`),
TypeScript uses camelCase (`threadId`). Wire enum values are SCREAMING_SNAKE_CASE
(`RUN_STARTED`) in both.

## Safety non-negotiables

These hold regardless of stack, framework, or scale — each exists because the
failure it prevents is silent and compounding:

1. **Scan every self-write** for prompt-injection phrasing, exfiltration
   patterns, and invisible Unicode before it is stored. Memory and skills are
   future context: a poisoned write is a persistent jailbreak that re-executes
   every session.
2. **Agents propose, humans approve.** Agent-created procedural lessons and
   skills stage in `pending/` and are never loaded until a human moves them
   out. Git diff is a perfectly good review UI.
3. **Never let the improving agent grade its own improvement.** Systems given
   an automatic self-graded target have faked their own test logs to hit it.
   Use real human decisions as ground truth; keep any automatic check held-out
   from the thing being improved.
4. **Never mutate context mid-conversation.** Memory loads as a frozen snapshot
   at session start; writes surface next session. Mid-run edits destabilize the
   agent and invalidate the prompt cache.
5. **Cap always-in-context memory** with explicit capacity headers; consolidate
   above ~80%. Attention budget is finite — capturing everything is fine,
   loading everything is not.
6. **Scope every lesson to the narrowest container** (user → team → app) and
   audit which container each lesson landed in. One user's sensitive facts must
   never surface in another user's context.
7. **A lesson may not change the loop itself.** Proposals that grant the agent
   new permissions, tools, or modifications to the learning pipeline are
   auto-rejected, whoever wrote them.

## Pitfalls

1. **Stale lessons.** Facts and saved skills rot silently — the day the refund
   limit changes, the agent is confidently wrong. Mitigate: `last_verified` +
   `review_by` dates, hit counts, a lint-and-curate cadence. → `references/memory-design.md`
2. **Gaming automatic scores.** An agent improved against a free metric will
   eventually improve the metric, not the work. Human decisions as ground
   truth; held-out checks for anything automatic. → `references/learning-layers.md`
3. **Prompt injection via self-writes.** See non-negotiable #1. Scan + stage.
4. **Cache-breaking context mutation.** See non-negotiable #4. Frozen snapshot;
   3-tier prompt order (stable → contextual → volatile).
5. **Unbounded memory growth.** Episodic memory belongs in a searchable store,
   not in-context; promote to always-loaded memory only above a threshold
   ("dreaming"-style consolidation, not append-forever).
6. **Confidently-wrong procedural rules.** A wrong learned workflow repeats
   forever, consistently. Require provenance (which run produced it) and
   repetition or human approval before promoting episodic → procedural.
7. **Container leakage.** Default narrowest scope; widening a lesson's scope is
   a human decision, never automatic.
8. **Learning from noise.** One-off successes become "rules". Distill from
   repeated signals; keep helped-counts; curate episodic aggressively.
9. **Failover thrash.** Retrying context-overflow or safety-refusal errors on
   another provider wastes money and hides bugs. Fail over only on auth,
   rate-limit, timeout, and billing errors; add warn/hard-stop loop guardrails
   for repeated no-progress tool calls. → `references/model-providers.md`, `references/capabilities.md`
10. **Untrusted capability imports.** Third-party skills and MCP servers are
    untrusted code: trust levels, requires-gating, tool filtering
    (include/exclude lists), sampling caps, sandboxed non-main sessions.
    → `references/capabilities.md`

## Verification

Prove the loop works end-to-end with a **synthetic-correction test** before
handing over:

1. Run the agent on a task through the AG-UI endpoint; confirm lifecycle events
   (`RUN_STARTED` → ... → `RUN_FINISHED`) and tool-call events stream correctly.
2. Inject a fake user correction/override through the capture path.
3. Run the distiller; confirm a candidate lesson appears in `pending/` with the
   right type, scope, confidence, and `source_events` pointing at your fake
   correction.
4. Approve it; confirm the next session loads it (and the audit trail shows
   who approved).
5. Reject a second synthetic lesson; confirm it never reaches live memory.
6. Run `scripts/memory_lint.py`; confirm it exits clean, then back-date a
   `review_by` and confirm it flags.

Stack-specific commands for each step are at the end of `references/python-stack.md`
and `references/typescript-stack.md`. If any of these six checks can't be
demonstrated, the corresponding loop stage is not actually wired — fix it
before calling the build done.
