# Research-assistant pipeline — overview

Four agent roles, all currently hardcoded to `claude-opus-4-1` via one module
constant in `pipeline.py`:

| Role | What it does | Calls/month (approx) |
|---|---|---|
| orchestrator | plans the research, talks to the user, assembles the final answer | ~3,000 |
| researcher | subagents fanned out to read sources and extract findings | ~25,000 |
| summarizer | compresses every fetched document before it enters context | ~120,000 |
| critic | reviews drafts, flags unsupported claims | ~8,000 |

Last month's LLM bill: **$4,300**. The summarizer alone is ~80% of call volume
and is doing work a small model could do.

Infra notes:
- We have an idle Ollama box on the office network (llama-class models, OpenAI-compatible at :11434).
- Accounts exist for Anthropic, OpenAI, and OpenRouter.
- We've been rate-limited by providers twice this quarter; both times the whole
  pipeline stalled because there was no fallback.
