# Capabilities: tools, MCP, and skills

Deep-dive on the capability surface of a self-improving agent: custom tools, MCP
(as client *and* server), skills, and the guardrails around all three. The
selection logic (tool vs MCP vs skill) lives in SKILL.md Tree 3 and
`assets/capability-extension/decision-matrix.md` — this file covers the
*mechanics* of each mechanism and why they are built the way they are.

The framing that matters: in a self-improving agent, capabilities are not a
static list. Skills are the one capability the agent can safely author for
itself (they are procedural memory in executable-adjacent form), while tools and
MCP servers define the permission surface and must stay human-controlled. Design
the capability layer so that distinction is structural, not a convention.

## The uniform tool surface

Expose native tools, MCP-provided tools, and skills to the model through one
dispatch path — everything is "a callable tool" from the model's point of view
(pattern as done in OpenClaw, where native families, MCP tools, and skills all
surface uniformly). Why this matters for self-improvement:

- **One place to log.** Every tool result flows through one dispatcher, so
  mirroring `tool_result` / `run_error` signals into the learning inbox
  (`assets/agui/learning-signal.schema.json`) is a single hook, not N.
- **One place to gate.** Sandbox allow/deny lists, loop guardrails, and
  per-agent projections apply uniformly instead of per-mechanism.
- **Stable names for memory.** Distilled lessons reference tools by name
  ("use `lookup_order` before any refund action"); a uniform, stable naming
  scheme keeps those lessons valid.

Split sessions by privilege, not by convenience: give the **main session** full
tool access and run **non-main sessions** (subagents, background jobs) sandboxed
with high-blast-radius families denied (as done in OpenClaw, whose non-main
sandbox denies browser/canvas/nodes/cron/gateway). The background distiller and
curator never need browser or messaging access — denying it costs nothing and
removes whole classes of self-write exfiltration paths.

Frontend-defined tools are part of the same surface: AG-UI delivers them in
`RunAgentInput.tools` with JSON-Schema parameters, and calling one is both a UI
action and a human-in-the-loop learning signal. See
`references/ag-ui-integration.md` for that wiring.

## Custom tools

### One spec, adapters per wire protocol

Define each tool once as a JSON-Schema dict and let thin adapters map it to
whatever `api_mode` the resolved provider speaks — `input_schema` for
`anthropic_messages`, `{"type": "function", "function": {...}}` for
`chat_completions`, `function_declarations` for `gemini`. Scaffold from
`assets/capability-extension/tool_template.py`, which carries the mapping in its
docstring. This keeps tools portable across the provider tiers in
`assets/config/models.yaml` — a subagent on a cheap OpenAI-compatible model and
the orchestrator on Anthropic call the identical tool.

Write descriptions for the model, not for documentation: state what the tool
returns and *when to use it* ("Use before any refund action"). On failure, raise
an error with a model-readable message — the model reads it and self-corrects,
which is cheaper than a retry wrapper.

### Central registry

Keep a single registry where tools self-register at import time and are grouped
into togglable toolsets (pattern as done in hermes-agent's `tools/registry.py`:
70+ tools in 28 toolsets, registered via `registry.register()`, toolsets
toggled per platform). The registry is where uniform-surface benefits are
implemented: logging, guardrail counters, and per-agent toolset projection all
live in one dispatch function. It is also what makes capability *reduction*
easy — turning a toolset off for the distiller role is a config line, not a
code change.

### RPC tool calling from sandboxed code

When the agent writes and executes scripts (an `execute_code` / terminal tool),
let those scripts call back into registered agent tools over a local RPC channel
(as done in hermes-agent). Why: generated code can compose tools
programmatically — loop over 200 records calling `lookup_order` — without the
sandbox ever holding API credentials or network access of its own. The RPC
boundary preserves the registry as the single gated dispatch path even for
agent-generated code.

## MCP client: consuming external capabilities

Configure MCP servers declaratively; scaffold from
`assets/capability-extension/mcp-servers.template.yaml`. The knobs that matter,
and why:

- **Transport:** stdio (`command` / `args` / `env`) for local processes;
  streamable-HTTP (`url`, `headers`) for remote services. Substitute secrets
  from env vars (`${GITHUB_TOKEN}`), never inline — memory lives in a git repo
  and config often ends up beside it.
- **Auth:** `auth: oauth` for user-delegated access; mTLS for
  service-to-service. Let the MCP layer own token refresh so tools stay
  stateless.
- **Tool filtering:** `tools: {include: [...]}` (or exclude). Prefer an
  allowlist over default-all: every exposed tool costs context tokens in the
  tool list and widens the injection surface of a third-party server.
- **Namespacing:** prefix tools with their server — `mcp_<server>_<tool>`
  (hermes-agent style) or `server__tool` (OpenClaw style). Pick one convention
  and keep it stable: distilled lessons and skills reference tools by name, and
  renaming a server silently invalidates learned procedures.
- **Timeouts:** idle and lifetime timeouts per server, so a wedged stdio child
  doesn't pin resources forever (e.g. `timeouts: {idle_s: 300, lifetime_s: 3600}`).
- **Sampling with caps:** MCP servers may request LLM inference from the host
  ("sampling"). Cap it — count and model tier — and route it through a cheap
  task slot in `models.yaml`, never the main model. An uncapped third-party
  server can otherwise spend your frontier-model budget.
- **Dynamic re-discovery:** honor `notifications/tools/list_changed` so
  servers can evolve their tool set live. Caveat: a changed tool list changes
  the prompt, which breaks prefix caching — treat re-discovery like a memory
  write and apply it at session boundaries when possible.
- **Per-agent projection:** scope each server to the roles that need it
  (`agents: [researcher]`). The distiller has no business seeing the GitHub
  server; narrow projection is the container principle applied to capabilities.

## Exposing your agent as an MCP server

The relationship inverts cleanly: an agent that *consumes* MCP can also *be* an
MCP server so other agents and hosts call it as a tool (as done in hermes-agent
via `hermes mcp serve`). Use this when the answer to "should other agents use
YOUR agent?" is yes — it turns your agent into a composable capability without
inventing a bespoke API, and every inbound call still flows through your
registry, guardrails, and learning capture. Keep the exposed tool set an
explicit allowlist for the same reasons as above, now from the server side.

## Skills: procedural memory in file form

A skill is a directory with a `SKILL.md` plus optional `references/`,
`scripts/`, `templates/`, `assets/`. Treat skills as the executable end of the
procedural-memory spectrum: a good run distilled into a reusable file that costs
~100 tokens of context until actually used (pattern popularized by
Anthropic/Manus "turn a run into a SKILL.md"). That token profile is *why*
skills scale where prompt stuffing does not.

### Frontmatter that earns its place

`name` and `description` are mandatory — the description is the trigger, so
write it as "when to use + what it does." Useful optional fields, with the
problem each solves:

- `requires` gating — `{bins, env, config, os}` (as done in OpenClaw's
  `metadata.openclaw.requires`) plus `requires_toolsets` /
  `required_environment_variables` (hermes-agent). A skill that assumes `ffmpeg`
  or a toolset should fail *at load*, not mid-procedure.
- `user-invocable` / `disable-model-invocation` / command-dispatch — separates
  "human runs this as a slash command" from "model may load this on its own."
  Set `disable-model-invocation` on destructive or expensive procedures.
- Versioning, platforms, tags/category for hub distribution and curation.

### Body contract

Structure the body as **When to Use / Procedure / Pitfalls / Verification**
(hermes-agent convention). Each section has a job: When-to-Use keeps the model
from loading it spuriously; Procedure is the payload; Pitfalls encodes the
original failure the skill exists to prevent; Verification makes the skill
checkable from the run trace — which later feeds `hit_count` / helped-count
curation.

### Progressive disclosure

Never preload skill bodies. Use three levels (as done in hermes-agent):
Level 0 `skills_list()` — names + descriptions, ~3k tokens for the whole
library; Level 1 `skill_view(name)` — one SKILL.md body; Level 2
`skill_view(name, path)` — a specific reference file inside the skill. This is
the same frozen-index principle as `memory/MEMORY.md` carrying one-line pointers:
the always-loaded layer stays small and cache-stable, detail is pulled on demand.

### Precedence and per-agent allowlists

Resolve name collisions by layer: workspace > project > personal > managed >
bundled (> plugin), as done in OpenClaw. The ordering is what makes
self-improvement non-destructive — an agent-authored or user-local skill can
shadow a bundled one without modifying it, and reverting is deleting a file.
Per-agent skill allowlists are **non-merging** (the list *is* the final set),
which keeps each role's capability set explicit and auditable rather than an
accumulation of defaults.

## Autonomous skill creation — the self-improvement hook

This is where the capability layer joins the learning loop
(`assets/learning-loop/LOOP.md`). Let the agent *draft* skills when a trigger
fires (thresholds as done in hermes-agent):

1. A task took **≥5 tool calls** and will plausibly recur.
2. Recovery after an **error or dead-end** — the fix is worth keeping.
3. A **user correction** — the highest-value signal there is.
4. A discovered **non-obvious workflow**.
5. An explicit **`/learn`** command (create a skill from a codebase, URL, or
   the just-completed workflow).

Rules that keep this safe:

- **Draft from the template.** Use
  `assets/capability-extension/SKILL-authoring.template.md` — it forces
  provenance (`created_by: agent`, `source_events` citing AG-UI thread/run/event
  refs, `review_by` staleness date, `approved_by`). A lesson you can't trace to
  the events that motivated it can't be audited or trusted.
- **Stage, scan, approve.** Drafts land under `skills/pending/`, get the same
  safety scan as memory writes (injection phrases, exfiltration patterns,
  invisible Unicode), then a human reviews the diff and approves or rejects.
  Both reference systems converge on this shape: hermes-agent's
  `write_approval` + `guard_agent_created` with a pending/ staging area and
  `/skills pending|diff|approve|reject`, and OpenClaw's Skill Workshop where the
  agent drafts a PROPOSAL and a human applies it. Pending skills are **never
  loaded** into any agent's context.
- **Patch over rewrite.** Prefer minimal `old_string`/`new_string` edits to
  regenerating a skill wholesale — small diffs are reviewable diffs, and
  rewrites silently drop accumulated pitfall notes.
- **Skills only.** The agent may author skills; it may **not** define new
  custom tools or MCP servers for itself. Skills add know-how over existing,
  already-gated capabilities; tools and MCP servers change the permission
  surface, and that decision stays with humans.

## Importing third-party capabilities: hubs and trust

Skill hubs exist (official registries plus openai/skills, anthropics/skills,
huggingface/skills, NVIDIA/skills, clawhub, lobehub) and typically carry trust
levels — builtin / official / trusted / community (hermes-agent's scheme).
Operate on one rule, stated verbatim by the OpenClaw docs for their own
registry: **treat third-party skills as untrusted code.** The same applies to
third-party MCP servers — both inject text and behavior into your agent.

Mitigations, cheapest first: read the skill before installing it; rely on
`requires` gating to keep it inert where its dependencies are absent; run the
same scanner used for self-writes over imported files (invisible-Unicode and
injection-phrase checks — `scripts/memory_lint.py` shows the deterministic
pattern); filter and cap MCP tools and sampling as above; and let the sandbox
be the last line, not the first.

## Loop guardrails

Repeated-failure loops burn model budget, wedge sessions, and — specific to
self-improving agents — flood the episodic log and signal inbox with noise the
distiller must then discard. Bound them with escalating counters on the tool
dispatcher (thresholds as shipped in hermes-agent):

```yaml
tool_loop_guardrails:
  warn_after:      {exact_failure: 2, same_tool_failure: 3, idempotent_no_progress: 2}
  hard_stop_after: {exact_failure: 5, same_tool_failure: 8, idempotent_no_progress: 5}
```

Warn = inject a system note telling the model to change strategy; hard-stop =
abort the tool loop. Keep this distinct from provider failover: repeated *tool*
failures mean the approach is wrong and switching models won't help, whereas
auth/rate-limit/timeout errors are provider problems (error taxonomy in
`references/model-providers.md`). Conflating the two produces failover thrash.

## Sandboxing menu

Terminal/code execution needs an explicit backend choice rather than an
assumption of "local shell." The menu (as offered by hermes-agent): **local**
(trusted dev only), **docker**, **ssh** (remote host), **singularity** (HPC),
**modal** and **daytona** (remote cloud sandboxes). Pick per deployment; the
tool contract stays identical.

For container backends, harden by default — read-only root filesystem, dropped
capabilities, PID limits — because agent-generated code is exactly the workload
container hardening was invented for. Use **one persistent container shared
across tool calls, subagents, and session resets**: installed dependencies and
working files survive between steps, which is both faster and cheaper than
per-call containers, while the hardening bounds what persistence can cost you.
Combine with the session split from the uniform-surface section: non-main
sessions get the sandboxed backend and the denied tool families.

## Key sources

- hermes-agent (Nous Research): https://github.com/NousResearch/hermes-agent · docs: https://hermes-agent.nousresearch.com/docs
- OpenClaw: https://github.com/openclaw/openclaw · docs: https://docs.openclaw.ai · registry: https://clawhub.ai
- AG-UI tool concepts (frontend tools in `RunAgentInput.tools`): https://docs.ag-ui.com/concepts/tools
- Skill format baseline: agentskills.io standard (as adopted by hermes-agent)
