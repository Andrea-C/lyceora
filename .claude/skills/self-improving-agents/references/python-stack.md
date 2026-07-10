# Python stack — implementing the self-improving agent

Walkthrough for the Python variant: FastAPI serving the AG-UI endpoint, a thin
provider layer over the model zoo, SQLite for sessions and episodic recall, and
a background distiller on a cheap model. Read this after picking Python in
SKILL.md step 4; pair it with `references/ag-ui-integration.md` for protocol
depth and `references/memory-design.md` for the store you are writing into.

## Component → asset map

Scaffold in dependency order (SKILL.md step 5). Copy assets into the project,
then adapt — do not import them in place.

| Component | Start from | Deep dive |
|---|---|---|
| Model routing config | `assets/config/models.yaml` | model-providers.md |
| AG-UI endpoint + signal inbox | `assets/agui/python/server.py`, `assets/agui/learning-signal.schema.json` | ag-ui-integration.md |
| Memory tree | `assets/memory/LAYOUT.md` + the three `.template.md` files | memory-design.md |
| Distiller | `assets/learning-loop/distill.py`, `distiller-prompt.md`, `LOOP.md` | memory-design.md |
| Health checks | `scripts/memory_lint.py` (run on cron) | — |
| Tools / MCP / skills | `assets/capability-extension/*` | capabilities.md |

Baseline dependencies: `pip install fastapi uvicorn ag-ui-protocol pyyaml`
plus whichever provider SDKs the pruned `models.yaml` still needs.

## Provider layer: build vs adopt

Three viable shapes. Choose based on what the host project already uses
(SKILL.md workflow step 1), not on taste.

**Option A — direct SDKs behind the universal provider record (build).**
Every provider reduces to `{provider, model, base_url, api_key, api_mode}`;
the 100+ provider zoo collapses onto a handful of wire protocols (hermes-agent
runs everything through three modes: `chat_completions`, `anthropic_messages`,
and a responses-style mode). One `openai.OpenAI(base_url=..., api_key=...)`
client covers every `chat_completions` provider — OpenAI, OpenRouter, Ollama,
vLLM, any custom endpoint — so "adding a provider" is usually a config entry,
not code. Build this when you need control over failover taxonomy, tier
resolution, and session stickiness (see `assets/config/models.yaml` header
comments for the exact rules, and model-providers.md for the rationale).

**Option B — LiteLLM (adopt for breadth).** One `completion()` call fronting
100+ providers; fastest path to multi-provider. Cost: a dependency in the hot
path whose own model-name mapping and error normalization sit between you and
the failover behavior you want to own. Reasonable for prototypes; revisit
before you rely on precise error-taxonomy-driven failover.

**Option C — Pydantic AI or LangGraph (adopt the framework).** Both ship
first-party AG-UI integrations, so the `run() → event stream` translation and
the endpoint come nearly free. Adopt when the host project already uses one.
Even then, keep memory on disk in the shared layout rather than inside the
framework's store — detached memory is what makes lessons portable across
harnesses (the pattern behind one team sharing the same memories across a
CopilotKit agent, Google ADK, and Microsoft Agent Framework).

Whatever the option, route model choice through `models.yaml`: roles map to
tiers, tiers are ordered fallback chains of `provider/model` refs (split on the
FIRST slash, so `openrouter/moonshotai/kimi-k2` parses correctly). Caveat the
config itself repeats: **model IDs rot** — verify current names per provider
before first run.

## Config loading: `${VAR}` substitution + precedence

Secrets never live in YAML. Name env vars in config; substitute at load time;
keep the precedence order CLI args > config file > `.env` > built-in defaults
(the hermes-agent convention) so a one-off CLI override never requires editing
a file that is under version control.

```python
import os, re, pathlib, yaml

def load_config(path: str) -> dict:
    raw = pathlib.Path(path).read_text(encoding="utf-8")
    raw = re.sub(r"\$\{(\w+)\}", lambda m: os.environ.get(m.group(1), ""), raw)
    return yaml.safe_load(raw)

# Merge lowest-precedence first: defaults <- .env-derived <- config <- CLI args.
```

Load `.env` before `load_config` runs (e.g. `python-dotenv`) so `${VAR}`
substitution sees it. A missing env var should fail loudly at startup, not at
the first API call three hours into a session.

## AG-UI endpoint: FastAPI + `ag-ui-protocol`

The Python SDK lives in `ag_ui.core` (event classes, `RunAgentInput`) and
`ag_ui.encoder` (`EventEncoder`, which negotiates SSE vs other encodings from
the request's `Accept` header). Field-name rule that trips everyone once:
**Python uses snake_case** (`thread_id`, `run_id`, `message_id`, `delta`),
TypeScript uses camelCase, and wire enum values are SCREAMING_SNAKE_CASE.

```python
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from ag_ui.core import (RunAgentInput, EventType, RunStartedEvent,
                        RunFinishedEvent, RunErrorEvent)
from ag_ui.encoder import EventEncoder

app = FastAPI()

@app.post("/agent")
async def agent_endpoint(input_data: RunAgentInput, request: Request):
    encoder = EventEncoder(accept=request.headers.get("accept"))
    async def gen():
        try:
            yield encoder.encode(RunStartedEvent(type=EventType.RUN_STARTED,
                thread_id=input_data.thread_id, run_id=input_data.run_id))
            # ... call the resolved model; translate provider stream deltas into
            #     TEXT_MESSAGE_* / TOOL_CALL_* events (see assets/agui/python/server.py)
            yield encoder.encode(RunFinishedEvent(type=EventType.RUN_FINISHED,
                thread_id=input_data.thread_id, run_id=input_data.run_id))
        except Exception as e:
            yield encoder.encode(RunErrorEvent(type=EventType.RUN_ERROR, message=str(e)))
    return StreamingResponse(gen(), media_type=encoder.get_content_type())
```

Any POST endpoint that accepts `RunAgentInput` and returns a `BaseEvent` stream
is AG-UI compatible — no registration, no handshake. `RunAgentInput` carries
`messages`, `state`, `tools` (frontend-defined tools with JSON-Schema params —
the human-in-the-loop channel), `context`, and `forwarded_props`.

Event-count caveat: docs cite "16/17 core events" for the classic families, but
the current reference is ~28–30 once the REASONING_* and ACTIVITY_* families
are included (THINKING_* was removed at v1.0.0). Enumerate `EventType` in your
installed SDK version rather than trusting any written count.

**The endpoint has a second job: learning capture.** The interface is the only
vantage point that sees both what the agent did and what the human did about
it, so `assets/agui/python/server.py` gives the server two routes — `/agent`
(the run endpoint, which mirrors agent-half signals like tool results and
errors into the inbox) and `/learning/signals` (where the frontend posts
user-half signals: corrections, approvals, overrides). Both append JSONL
records matching `assets/agui/learning-signal.schema.json` to
`learning/inbox/`. Persist the raw event stream too; the distiller and any
future audit want it.

## Sessions + episodic recall: SQLite with FTS5

Persist every session turn to SQLite and index it with FTS5 (the hermes-agent
`state.db` pattern). This is what makes episodic memory *searchable rather than
in-context*: the agent recalls a weeks-old case on demand via a search tool,
without that history occupying the prompt.

```python
import sqlite3
db = sqlite3.connect("state.db")
db.execute("""CREATE VIRTUAL TABLE IF NOT EXISTS session_fts
              USING fts5(session_id, ts, role, content)""")
db.execute("INSERT INTO session_fts VALUES (?, ?, ?, ?)", (sid, ts, role, text))
hits = db.execute(
    """SELECT session_id, ts, snippet(session_fts, 3, '[', ']', '…', 12)
       FROM session_fts WHERE session_fts MATCH ? ORDER BY rank LIMIT 5""",
    ("refund NEAR approval",)).fetchall()
```

Expose the query as a `session_search` tool. FTS5 ships compiled into the
SQLite bundled with CPython on mainstream platforms; verify with
`sqlite3.connect(":memory:").execute("pragma compile_options").fetchall()` if
you target unusual builds. Curated daily episodic *summaries* still go to
`memory/user/<id>/episodic/YYYY-MM-DD.md` per `assets/memory/LAYOUT.md` — the
DB is raw recall, the Markdown log is the curated record.

## Frozen-snapshot memory loading

Read the memory files once at session start, build the system prompt from
them, and never rebuild mid-session. Mid-session memory writes go to disk only
and surface in the *next* session. Why: mutating context mid-conversation
invalidates the provider's prompt prefix cache (cost) and changes agent
behavior mid-run (unpredictability). This is the cache-stable 3-tier prompt
pattern (as done in hermes-agent): stable identity → skills/context → volatile
memory snapshot, most-stable first.

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class MemorySnapshot:
    app: str; team: str; user: str

def load_snapshot(root, team_id: str, user_id: str) -> MemorySnapshot:
    read = lambda p: (root / p).read_text(encoding="utf-8") if (root / p).exists() else ""
    return MemorySnapshot(read("app/MEMORY.md"),
                          read(f"team/{team_id}/MEMORY.md"),
                          read(f"user/{user_id}/MEMORY.md"))
# Prompt assembly, once per session:
#   tier 1 (stable):   identity/persona + tool guidance
#   tier 2 (context):  skill instructions, project context
#   tier 3 (volatile): snapshot.app + snapshot.team + snapshot.user + timestamp
```

Load order is widest-to-narrowest so the narrowest scope wins on conflict.
Never load anything from `memory/pending/`. Keep the capacity-header
discipline from `assets/memory/MEMORY.template.md` (consolidate above 80%) —
`scripts/memory_lint.py` flags violations.

## Background distiller: async worker on the cheap tier

`assets/learning-loop/distill.py` is the scaffold: read `learning/inbox/*.jsonl`,
call the model resolved from `models.yaml` `agents.distiller` (cheap tier —
never the orchestrator's model: it would burn frontier-model budget on
background work and churn the main prompt cache), safety-scan and
confidence-gate the output, write proposals under `memory/pending/`. Only
`call_model()` is left for you to fill; use the same provider layer as the
main agent.

Two deployment shapes:

- **Separate process on cron / systemd timer** (default): restart-safe,
  isolated from the serving process, and `distill.py` already moves processed
  inbox files aside so re-runs are idempotent.
- **In-process asyncio worker** when the deployment is a single container:

```python
import asyncio
from contextlib import asynccontextmanager
import distill  # your copied distill.py

async def distiller_worker(interval_s: int = 3600):
    while True:
        await asyncio.sleep(interval_s)
        await asyncio.to_thread(distill.main)   # keep the event loop free

@asynccontextmanager
async def lifespan(app):
    task = asyncio.create_task(distiller_worker())
    yield
    task.cancel()
```

Either way the gate is the same: proposals land in `pending/`, nothing in
`pending/` is ever loaded, and approval is a human moving the file (see
`assets/learning-loop/LOOP.md` for the full cadence and auto-approve policy).

## Local providers: Ollama and vLLM gotchas

With the universal record, local models are just more provider entries — but
two gotchas bite silently:

- **Ollama defaults to a ~4k context window** regardless of what the model
  supports. Symptoms are silent truncation: lost system-prompt tiers, amnesiac
  behavior, tools "forgotten" mid-session. Always set `context_length`
  explicitly (`models.yaml` carries `default_context_length` on the ollama
  provider for this reason). Endpoint: `http://localhost:11434/v1`,
  `api_mode: chat_completions`, no API key.
- **vLLM needs tool-calling flags** or function calls come back as plain text:
  `vllm serve meta-llama/Llama-3.1-70B-Instruct --enable-auto-tool-choice
  --tool-call-parser hermes`. Remote vLLM may still want an API key even
  though local serving usually doesn't.

Route privacy-sensitive learning jobs (the distiller reading user
corrections, for instance) to the `local` tier when data must not leave the
host — that is the main reason the tier exists.

## Verification: the synthetic-correction test

Prove the whole loop before real users touch it. Inject a fake correction,
watch it travel capture → distill → gate → apply → next-session load. Paths
below assume assets were copied to the project root.

```bash
# 1. Inject a synthetic user correction (the user half of the stream)
curl -s -X POST http://localhost:8000/learning/signals \
  -H "Content-Type: application/json" \
  -d '{"thread_id":"th_test","run_id":"run_test","actor":"user",
       "signal":"explicit_teach","scope_hint":"user/test-user",
       "context":"Always include the order id when drafting refund escalations."}'

# 2. Confirm capture
cat learning/inbox/signals-$(date +%F).jsonl

# 3. Run the distiller (must resolve to the cheap tier — check your logs)
python learning-loop/distill.py

# 4. Confirm a gated proposal exists — and that no session loads it from here
ls memory/pending/user/test-user/

# 5. Lint, then approve by moving out of pending/ (the git diff is the review UI)
python scripts/memory_lint.py memory
git -C memory add -A && git -C memory diff --staged
mv memory/pending/user/test-user/procedural/*.md memory/user/test-user/procedural/

# 6. Start a NEW session and confirm the lesson pointer appears in the prompt.
#    The CURRENT session must NOT see it — frozen snapshot working as intended.
```

If step 4 turns up nothing, check the confidence gate (< 0.5 is dropped by
design) before suspecting the model. If step 6 shows the lesson in the current
session, you have a mid-session context mutation bug — fix it before shipping.

## Key sources

- AG-UI docs: https://docs.ag-ui.com/introduction · /concepts/events ·
  /concepts/architecture · /quickstart/server
- AG-UI repo: https://github.com/ag-ui-protocol/ag-ui (Dojo examples under `apps/dojo`)
- CopilotKit (first-party frontend client): https://github.com/CopilotKit/CopilotKit
- hermes-agent (provider record, auxiliary slots, FTS5 sessions, frozen
  snapshot): https://github.com/NousResearch/hermes-agent ·
  https://hermes-agent.nousresearch.com/docs
- OpenClaw (disk-backed memory, gated skill acquisition): https://docs.openclaw.ai
