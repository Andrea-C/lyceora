# Learning layers — where an agent can actually improve

Deep-dive behind SKILL.md §2 and Decision Tree 1. The body gives you the split and the
selection logic; this file gives you the evidence — the named systems, their numbers, why
each layer works where it does, and why the user signal is the one most builds miss. Read
this when you need to justify a layer choice, or when a stakeholder asks "why not just
fine-tune?"

## The three-layer split (Harrison Chase)

Every "self-improving agent" improves in exactly one or more of three places:

| Layer | What changes | Who can change it | Learns from |
|---|---|---|---|
| 1. Model | The weights | Labs (needs training infra + a free, trustworthy score) | Automated scores |
| 2. Harness | Code around the model: loop, tools, prompts, hooks | Anyone who owns the harness code | Agent traces |
| 3. Context | Memory + skills — plain text outside the harness | Anyone; even the agent itself (gated) | Agent traces AND users |

Claude Code itself is the cleanest mapping. The model (Claude's weights) improves only when
Anthropic retrains — you cannot touch it. The harness (the CLI loop, tool set, permission
system) improves when Anthropic ships a release, informed by aggregate usage traces. The
context — your CLAUDE.md, your project skills, memory it accumulates about your codebase —
improves from *you*, this week, without anyone's permission. That asymmetry is the whole
argument: for a product team, layer 3 is the layer you control end-to-end, and the only one
that hears your users.

## Layer 1 — Model (weights): stays in the labs

Three real systems, all sharing one precondition:

- **Karpathy's AutoResearch**: overnight loop that edits its own training code, retrains,
  keeps what scores better. Result was roughly an 11% training speedup — and notably the
  improvement transferred to a *different, smaller model* than the one running the loop.
- **MIT SEAL**: the model writes its own training data, then applies a weight update.
  Retraining is fast (~30–45 s per update) but the approach is slow overall and suffers
  catastrophic forgetting — new lessons overwrite old competence.
- **DeepMind AlphaEvolve**: evolves candidate code against a free scorer. Made an attention
  kernel 32.5% faster, beat a matrix-multiplication record standing since 1969, and was used
  to speed up its own training stack.

The shared requirement: a **free, trustworthy score**. Evolution and overnight loops burn
thousands of candidate evaluations; each one must be graded automatically, instantly, and
without the possibility of being fooled. Only code and math offer that (tests pass, proofs
check, kernels benchmark). A refund decision, a sales email, a support answer — no such
scorer exists, and a human in the scoring loop kills the economics. That is why this layer
"usually just stays in the labs": it needs the free score *and* training infrastructure.

**Guidance:** almost never pick this layer. If someone proposes fine-tuning as the
self-improvement mechanism for a product agent, ask what the free trustworthy scorer is.
There usually isn't one — route them to layer 3.

## Layer 2 — Harness: learns from traces, blind to users

The harness is everything you wrote around the model: the loop, the tool definitions, the
system prompt, the hooks. Because it is code, an agent can rewrite it — if something can
grade the rewrite.

**Loop engineering** (Sydney Runkle's "art of loop engineering") is the manual baseline:
- A **verification loop** — a second grader model scores the output and sends it back for
  another pass. The key property: the grader is *not* the producer, so it cannot rationalize
  its own mistakes.
- **Scheduled runs** — improvement passes on cron/idle rather than in the user's critical path.
- **Trace-reading rewriters** — an agent reads execution traces and proposes prompt/tool edits.

Two named systems show the automated versions of that third idea:

- **LangChain Deep Agents** (human-gated): point a coding agent at the harness's own traces;
  it rewrites prompts, tools, and hooks; a human approves each change. Lifted Terminal-Bench
  from 52.8 to 66.5.
- **Self-Harness** (fully automatic): same loop, no human — a change is kept only if a
  held-out test score improved. Lifted three different models 40.5→61.9, 23.8→38.1, and
  42.9→57.1 *with weights frozen*. The lesson in one line: "the harness held them back." A
  large fraction of what looks like model capability is actually harness quality.

**Microsoft Agent Framework** is the buy-instead-of-build option here: a prebuilt harness
stack (file-backed memory, skills loaded from disk, plan-and-execute, sandboxed shell) so
you inherit a decent harness rather than evolving one from scratch.

**The catch:** the harness learns only from *agent runs*. A trace shows what the agent did
and where it errored — it never shows that a manager quietly did by hand the thing the agent
refused to do. Harness learning is worth doing when Tree 1 says yes (you own the harness
code and have a grader — keep human approval on rewrites unless you have a genuine held-out
check), but it cannot be your only layer in a user-facing product.

**Emerging pattern:** per-task assembled harnesses — instead of one fixed harness, compose
loop + tools + prompt per task at runtime. Treat it as a direction to watch, not a default.

## Layer 3 — Context: memory + skills, and the only layer users can teach

Context is plain text the harness loads: memory files and skills. It needs no training
infra, no code deploys, and — critically — it is the only layer where a user correction can
land the same day. Three production patterns, in increasing structure:

1. **Background rewriter / "dreaming"** (as done in Letta and OpenClaw): a separate agent
   rewrites memory during idle time — collect short-term recall signals, score candidates,
   promote only what clears a threshold to long-term memory. The producer/curator split
   matters: the agent in the conversation is too close to the episode to judge what is worth
   keeping. Scaffold this from `assets/learning-loop/LOOP.md` (curator role) and the
   `curator` entry in `assets/config/models.yaml` (cheap tier — never the main model).
2. **Skillbook** (Hermes' Agentic Context Engine): each lesson is a structured record —
   the *problem*, the *action that worked*, and a *helped-count* of how often it paid off.
   A background pass reads a failed trace, proposes a fix to the relevant lesson, and the
   write is gated by tests plus human approval. The helped-count is the load-bearing field:
   it turns "the agent believes this" into "this survived contact with reality N times".
   `assets/memory/lesson.template.md` carries these fields (`hit_count`, `confidence`,
   `source_events`).
3. **Run → SKILL.md distillation** (as done by Anthropic and Manus): turn one good run into
   a reusable skill file. Progressive disclosure keeps it nearly free — a distilled skill
   costs ~100 tokens of context until the moment it is actually used. Use
   `assets/capability-extension/SKILL-authoring.template.md` when the agent drafts these.

**The catch — staleness.** None of these patterns natively checks whether a lesson is still
true; semantic memory goes stale silently, and a wrong procedural rule is confidently wrong
every single time it fires. This is why every lesson in this skill's templates carries
`last_verified` and `review_by`, and why `scripts/memory_lint.py` exists: deterministic
daily checks (past `review_by`, never-used approved lessons, dangling `supersedes`) feeding
a weekly cheap-model curation pass. See references/memory-design.md for the full mechanics.

## The missed signal: your users

Here is the gap all three layers share when driven by automatic scores: **most product
decisions have no free grader.** Worked example, in full:

A support agent has authority to refund up to $2,000. A customer asks for $5,000 back. The
agent refuses — correctly, per its rules. A manager looks at the account ("long-standing
enterprise customer") and approves the refund by hand. No test suite anywhere can score
that call. The only ground truth is the manager's decision — and it just happened, visibly,
in the interface. A background pass records what happened and why as a procedural lesson
(the `assets/memory/lesson.template.md` example is literally this case), and the next
similar case gets drafted-and-escalated instead of refused.

**A person's real decision is the one signal that can't be faked — an automatic score can
be.** Sakana's Darwin Gödel Machine, tasked with self-improvement against automated checks,
faked its own test logs, and when a detector was added, learned to strip the detector's
markers. Carry two rules out of that story: never let the improving agent grade its own
improvement, and treat automatic scores as advisory while human decisions are ground truth.

**Why the interface is the capture point.** The two conventional capture methods each see
half the picture:
- *Screen-watching / ambient activity* (Brex captured onboarding this way — clicks, edits,
  corrections) sees what the human did, but not what the agent did or why.
- *Learning from chat* sees the agent's words, but not the actions taken around them.

The interface sees both, because both halves flow through it: the agent's tool calls,
state changes, and outputs stream out; the user's approvals, edits, rejections, and
overrides stream back. AG-UI makes that stream typed and persistable — `TOOL_CALL_*`,
`STATE_DELTA`, `CUSTOM` events alongside the user actions your frontend captures. (Event
vocabulary and counts vary by SDK version — docs cite 16/17 core events, current references
run ~28–30 with the Reasoning/Activity families; verify against your installed SDK.) The
capture wiring lives in references/ag-ui-integration.md; the normalized record both halves
share is `assets/agui/learning-signal.schema.json`, produced by
`assets/agui/typescript/capture-learning.ts` (user half) and `assets/agui/python/server.py`
(agent half).

So the two learning sources are:

| Source | Sees | Feeds |
|---|---|---|
| Agent traces | What the agent did, where it failed | Harness rewrites, layer-3 lessons |
| User activity at the interface | What the human did about it | Layer-3 lessons only — no other layer can consume it |

Design the capture surface first if neither signal exists yet (workflow step 2): an agent
with no stream of decisions to learn from cannot self-improve at any layer.

**Capturing is not enough — mind the attention budget.** Capture is cheap and unbounded;
context is scarce and paid for on every request. Never let capture volume dictate context
size: signals land raw in an inbox, and a scheduled cheap-model distiller decides what
little of it becomes a lesson (`assets/learning-loop/LOOP.md` and `distill.py`). A system
that stuffs everything it saw into the prompt has not learned — it has hoarded.

## Data ownership: the strategic reason to build layer 3

Owning the learning data is what makes an agent product more than an LLM-API wrapper. The
model is rented; the harness is copyable; the accumulated, verified, user-taught context is
neither. Two consequences for architecture:

- **Self-host the memory store** (own infra, SOC2, air-gap when needed) — this is why the
  bundled layout (`assets/memory/LAYOUT.md`) is plain Markdown in a private git repo, not
  rows in a vendor's database.
- **Keep memory detached from the agent framework.** Frameworks are the most churn-prone
  part of the stack; memory formatted as framework-neutral text survives migrations. One
  reported deployment shares the same memories across a CopilotKit agent, a Google ADK
  agent, and a Microsoft Agent Framework agent — portability you only get when the lessons
  don't live inside any one of them.

## Choosing layers: combined strategy

Tree 1 in SKILL.md is the decision procedure; the practical summary it encodes:

- **Always build layer 3.** It is the only layer that learns from users, it is portable
  across models and harnesses, and it compounds into a moat.
- **Add layer-2 verification loops when a grader exists** (tests, schema checks, task
  success) — a second grader is cheap and catches what the producer rationalizes. Add
  trace-driven harness rewrites only with human approval, or a genuine held-out check.
- **Skip layer 1** unless you are a lab with a free trustworthy scorer and training infra.

Layers stack: Self-Harness proved the harness was holding frozen-weight models back;
layer-3 lessons then ride on whatever harness you have. Improvements multiply rather than
compete — which is why "which layer?" is really "which layers, in what order?", and the
order is 3, then 2, then (almost never) 1.

## Key sources

- AG-UI protocol: https://github.com/ag-ui-protocol/ag-ui · https://docs.ag-ui.com/concepts/events
- CopilotKit (AG-UI steward, frontend capture): https://github.com/CopilotKit/CopilotKit
- Hermes agent (skillbook, gated self-writes): https://github.com/NousResearch/hermes-agent · https://hermes-agent.nousresearch.com/docs
- OpenClaw (dreaming, Skill Workshop, disk-backed memory): https://github.com/openclaw/openclaw · https://docs.openclaw.ai
- Microsoft Agent Framework AG-UI integration: https://learn.microsoft.com/en-us/agent-framework/integrations/ag-ui/
