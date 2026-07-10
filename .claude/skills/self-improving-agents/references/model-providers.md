# Model Providers: Abstraction and Cost-Tiering Playbook

How to build the provider layer of a self-improving agent so that (a) any model —
frontier, mid-tier, cheap, or local — can fill any role, (b) background learning
jobs run on cheap models without touching the main agent's budget or prompt
cache, and (c) provider outages degrade gracefully instead of taking the agent
down. SKILL.md's decision tree tells you *which* tier each role gets; this file
is the *how* — the config shapes, the failover mechanics, and the local-model
gotchas.

Scaffold from `assets/config/models.yaml` (skill root). Everything below explains
the design choices baked into that file so you can adapt it rather than
cargo-cult it.

## The universal provider record

There are 100+ model providers, but only about three wire protocols worth
supporting: OpenAI-style chat completions, Anthropic messages, and OpenAI
responses (plus Gemini's native API if you need it). Nearly every provider —
including regional ones (GLM, Kimi, Qwen, MiniMax) and every local server
(Ollama, vLLM, SGLang, llama.cpp, LM Studio) — speaks one of these. So do not
write per-provider integrations. Define one record and reuse it everywhere
(main model, auxiliary slots, subagent delegation), the pattern proven in
hermes-agent:

```yaml
provider: anthropic          # or openai | google | openrouter | custom:<name> ...
model: claude-sonnet-5
base_url: null               # override for OpenAI-compatible endpoints
api_key_env: ANTHROPIC_API_KEY   # name the env var; never inline the secret
api_mode: anthropic_messages # anthropic_messages | chat_completions | openai_responses | gemini
```

Why this shape matters for a *self-improving* agent specifically: the learning
loop adds several new model consumers (distiller, curator, safety scanner,
compressor). If each needed bespoke integration work, teams would run them all
on the main model "for now" — which is exactly the cost and cache-stability
failure this layer exists to prevent. One record + `api_mode` dispatch makes
adding a cheap background model a config edit, not a code change.

Unknown OpenAI-compatible endpoints (corporate gateways, GPU boxes) slot in as
named custom providers rather than special cases:

```yaml
custom_providers:
  - { name: local, base_url: "http://localhost:8080/v1" }
  - { name: work,  base_url: "https://gpu-server.internal/v1", key_env: CORP_API_KEY }
```

### api_mode is the only real switch point

`api_mode` decides three things at call time: request/response shape, streaming
event format, and — easy to miss — the tool-definition schema. The same
JSON-Schema tool spec maps differently per mode:

| api_mode | Tool definition wrapper |
|---|---|
| `anthropic_messages` | `{name, description, input_schema: PARAMETERS}` |
| `chat_completions` | `{type: "function", function: {name, description, parameters: PARAMETERS}}` |
| `gemini` | `{function_declarations: [{name, description, parameters: PARAMETERS}]}` |

Keep tool specs in the neutral form and adapt at dispatch
(`assets/capability-extension/tool_template.py` shows the shape). If tool specs
are written in one provider's dialect, every fallback across an `api_mode`
boundary silently loses tool calling — a failure that only surfaces when the
fallback actually fires, i.e. during an outage.

## Model references and resolution hierarchy

Reference models as a single `provider/model` string, split on the **first**
slash only — model IDs themselves may contain slashes, so
`openrouter/moonshotai/kimi-k2` resolves to provider `openrouter`, model
`moonshotai/kimi-k2` (as done in OpenClaw). One string form means configs,
logs, and spawn-time overrides all name models the same way.

Resolve which model a given agent/role uses with a most-specific-wins
hierarchy (OpenClaw's `agents.list[].model` → `agents.defaults.model.primary`
→ `agents.defaults.model.fallbacks`, generalized):

1. Spawn-time override (argument on a subagent/session spawn)
2. Per-role explicit ref (`agents.<role>.model`)
3. Per-role named tier (`agents.<role>.tier` → ordered fallback chain)
4. Task slot (`task_slots.<slot>` — background utility jobs)
5. Global defaults

Tiers are named, ordered fallback chains of `provider/model` refs:

```yaml
tiers:
  strong:      # planning, orchestration, user-facing answers
    - anthropic/claude-opus-4-8
    - openai/gpt-5.4
    - openrouter/anthropic/claude-opus-4-8   # same family via a second provider
  cheap:       # classification, summarization, background learning passes
    - google/gemini-2.5-flash
    - anthropic/claude-haiku-4-5
  local:       # air-gapped / privacy-sensitive
    - ollama/qwen3:32b
    - vllm/meta-llama/Llama-3.1-70B-Instruct
```

The tier indirection (role → named chain → refs) is the piece most setups skip
and then regret: when a better cheap model ships, you want swapping every
background job onto it to be a one-line edit to the `cheap:` chain, not a hunt
through role configs. It also makes chains self-documenting — a reviewer can
see at a glance that `strong` falls back to the same model family through a
different provider (surviving a provider outage) before degrading capability.

**Caveat — model IDs rot.** Every concrete ID in `models.yaml` (and in this
file) is a snapshot. Verify current names against each provider before use, and
keep IDs only in the tiers section so rot is contained to one block.

## Role → tier assignments

Spend reasoning where it compounds; everything narrow, repetitive, or
background goes cheap. Default cheap and escalate on evidence — the reverse
(default expensive, downgrade later) never happens in practice because nothing
forces the revisit.

| Role | Tier | Why |
|---|---|---|
| Main orchestrator (plans, talks to user) | Frontier + fallback chain | Errors here cascade into every downstream action; user-facing quality is the product |
| Subagent workers (bounded, well-specified tasks) | Mid/cheap | The orchestrator already did the hard reasoning; workers execute a spec. Spawn-time override covers the rare hard task |
| Distiller (turns signals into lesson proposals) | Cheap | Runs on a schedule over every captured signal — volume makes frontier pricing untenable, and proposals are human-gated anyway |
| Compression / summarization | Cheap | Lossy by design; a frontier model summarizing is money spent making information disappear |
| Title generation, approval screening, safety scans | Cheap | Classification-shaped tasks; latency matters more than depth |
| Privacy-sensitive learning over user data | Local (Ollama/vLLM) | User corrections and episodic logs are the moat — self-hosting keeps that data (and SOC2/air-gap posture) yours |

Every role gets a fallback chain, not a single model. A self-improving agent
runs background jobs at 3 a.m.; there is no human around to notice a provider
outage and switch models by hand.

## Task slots: cheap background models without disturbing the main cache

Give each narrow background job its own independently-routable slot rather than
funneling everything through the main model. Hermes-agent's `auxiliary:` block
is the reference pattern — per-task configs for vision, web_extract,
compression, approval, title_generation, skills_hub, and mcp, each taking:

```yaml
auxiliary:
  compression:
    provider: auto        # auto | main | explicit provider | custom:<name>
    model: gemini-2.5-flash
    fallback_chain: [...]
    # also: base_url, api_key, timeout
```

OpenClaw does the same with coarser slots: `agents.defaults.utilityModel`,
`imageModel`, `pdfModel`.

Two reasons this matters beyond cost:

1. **Prompt-cache stability.** The main agent's system prompt should be
   cache-stable (stable identity → skills/context → volatile memory snapshot).
   If background jobs share the main model *and* main conversation, their
   activity churns the context and breaks the prefix cache. Side tasks on
   separate slots run in separate requests — the main cache never notices.
2. **Independent failover.** A rate limit on the frontier provider should not
   stall title generation, and a cheap-provider outage should not degrade the
   orchestrator. Separate slots, separate chains.

In `assets/config/models.yaml` these appear as `task_slots:` (vision,
compression, title_generation, safety_scan, embedding) plus learning-loop roles
under `agents:` (distiller, curator). The learning loop's distiller MUST NOT
share the orchestrator's model budget — it is the single highest-volume model
consumer in the system once capture is wired up.

## Subagent models

Two configuration shapes exist in the wild; support at least the second:

- **One model for all subagents** (hermes-agent `delegation:` block): a single
  `{model, provider, api_mode}` plus `max_concurrent_children` and
  `max_spawn_depth`. Simple, but per-call override is not supported there — a
  known limitation, not a design ideal.
- **Layered with spawn-time override** (OpenClaw): `agents.defaults.subagents.model`
  → per-agent `agents.list[].subagents.model` → `sessions_spawn(model=...)`,
  where the spawn-time argument wins. Prefer this: the default stays cheap and
  the orchestrator escalates a specific hard task without a config change.

Regardless of shape, honor two invariants:

- **Subagents start with a completely fresh conversation.** All state passes
  through explicit goal/context arguments (hermes-agent's
  `delegate_task(goal, context, toolsets, role)`). This is why cheap models work
  as workers: they get a bounded, fully-specified task, not the orchestrator's
  sprawling history. It also means a subagent on a small-context local model is
  viable even when the main thread would not fit.
- **Spawn and yield — never poll.** OpenClaw's `sessions_spawn` returns
  immediately (`{status: "accepted", runId, childSessionKey}`) and the parent
  later calls `sessions_yield`. A polling parent burns main-model tokens
  checking on cheap-model work, inverting the entire cost structure.

Recommended default: cheap subagents, premium main (this is OpenClaw's own
guidance). Cap `max_concurrent` and `max_spawn_depth` — recursive spawning on
even cheap models compounds fast.

## Failover: two-stage, with an error taxonomy

Model an outage response in two stages (as done in OpenClaw):

1. **Auth-profile rotation within the provider** — if multiple credentials
   exist for the failing provider, rotate before abandoning it. Apply
   escalating cooldowns to failing credentials: 30s → 1m → 5m; billing
   failures disable the credential for hours (they will not self-heal in
   minutes, and retrying burns rate limit against a dead key).
2. **Model fallback chain** — walk down the tier's ordered refs.

The error taxonomy is the part that prevents doom loops. Fail over **only** on
errors where a different provider/model plausibly succeeds:

- **Failover:** auth failures, rate limits, timeouts, billing errors.
- **Never failover:** context overflow (the request is too big — every model in
  the chain will also choke, or silently truncate; fix the request, e.g. via the
  compression slot), user aborts (the user said stop; retrying elsewhere
  ignores them), safety refusals (shopping a refused request across providers
  until one complies is a policy bypass, and in a self-improving agent the
  "success" may then get distilled into a lesson).

Add **session stickiness**: once a session resolves to a working model, stay on
it for the rest of that session rather than re-running the chain per request.
Mid-session model swaps thrash the prompt cache and produce inconsistent
behavior inside one conversation.

This taxonomy is also SKILL.md pitfall 9's mitigation: failover thrash usually
traces back to treating all errors as retriable.

Encode the policy where the chains live so it survives refactors — the header
of `assets/config/models.yaml` states it as a contract:

```yaml
# FAILOVER: walk down the tier chain on auth failure, rate limit, timeout,
# or billing errors (with per-provider cooldowns). Do NOT fail over on
# context overflow, user aborts, or safety refusals — fix the request instead.
# Stay on the resolved model for the rest of a session once it works.
```

One learning-loop-specific consequence: when the distiller's chain is
exhausted, *skip the pass* rather than falling back to the main model. Signals
stay in the inbox (`learning/inbox/*.jsonl` is durable) and the next scheduled
run picks them up. Distillation is deferrable; blowing the frontier budget on
it is not recoverable.

## OpenRouter: routing and credential pools

OpenRouter is one provider record that fronts hundreds of models, which makes
it the natural second or third link in every fallback chain. Two knobs worth
setting (hermes-agent config shapes):

```yaml
provider_routing: { sort: "price", only: ["anthropic"] }
```

`sort: price` routes each request to the cheapest upstream currently serving
that model; `only:` pins the upstream list when consistency matters more than
price (background distillation tolerates upstream variance; the main
orchestrator may not).

For multiple API keys per provider, configure credential-pool strategies —
`{openrouter: round_robin, anthropic: least_used}` — which feed stage-1
failover: more credentials in the pool means more rotation headroom before the
model chain is consulted at all.

## Local models: Ollama and vLLM gotchas

Local models are the right call for privacy-sensitive learning passes (the
distiller reads raw user corrections) and for air-gapped deployments. Both
mainstream servers speak `chat_completions`, so they plug into the universal
record — but each has a trap:

- **Ollama: `context_length` is mandatory.** Ollama defaults to a 4k context
  window regardless of what the model supports. An agent prompt (system tiers +
  memory snapshot + tools) blows past 4k immediately, and the failure is
  *silent truncation*, not an error — the model just starts ignoring your
  memory and earlier instructions. Always set it explicitly:

  ```yaml
  model_params:
    "ollama/qwen3:32b": { context_length: 32768 }
  ```

- **vLLM: tool calling is off by default.** Serve with tool-choice enabled and
  the parser matching your model's tool-call format, or every tool invocation
  comes back as plain text:

  ```
  vllm serve meta-llama/Llama-3.1-70B-Instruct \
    --enable-auto-tool-choice --tool-call-parser hermes
  ```

  (`hermes` here names a tool-call output format used by several open models —
  check your model card for the right parser.)

Remote/self-hosted vLLM behind auth still uses the same record — set
`api_key_env` (often unused for localhost, required for shared GPU servers).

Sizing note: an always-on agent with a well-factored loop runs acceptably on
~30B-class local models (hermes-agent's stated floor) — because subagents get
fresh bounded contexts and background jobs are narrow, local models do not need
to match the frontier orchestrator, just their own slot's job.

## Scaffolding checklist

1. Copy `assets/config/models.yaml` to the project, delete providers you will
   not use, and **verify every model ID is current** (they rot).
2. Map your agent roles onto `agents:` — strong tier for orchestration/planning,
   cheap for distiller/curator/subagents. Keep `defaults.last_resort` pointing
   at the `local` tier so total remote outage degrades instead of halting.
3. Fill `task_slots:` for every background job the learning loop introduces
   (compression, safety_scan, title_generation) before wiring the loop itself —
   otherwise those jobs silently default to the main model.
4. Export the named env vars; confirm no key appears in the file itself.
5. Test the failover path deliberately: point the first ref in a chain at an
   invalid key and confirm the runtime rotates/falls through with cooldowns
   rather than hammering the dead entry.

## Key sources

- hermes-agent (Nous Research): https://github.com/NousResearch/hermes-agent · docs: https://hermes-agent.nousresearch.com/docs — universal provider record, auxiliary slots, delegation block, credential pools, vLLM/Ollama guidance
- OpenClaw: https://github.com/openclaw/openclaw · docs: https://docs.openclaw.ai — `provider/model` refs, selection hierarchy, utility/image/pdf slots, two-stage failover + error taxonomy, per-subagent models, spawn/yield
