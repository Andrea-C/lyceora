# The learning loop: capture → distill → apply → verify → curate

## 1. Capture (continuous, free)
- Frontend posts user signals (corrections, approvals, rejections, overrides,
  explicit teaching) — see `assets/agui/typescript/capture-learning.ts`.
- Server mirrors agent-trace signals (tool results, errors) — see
  `assets/agui/python/server.py`.
- Everything lands as JSONL in `learning/inbox/`. Capture is cheap; NEVER let
  capture volume dictate context size — that is the distiller's job to manage.

## 2. Distill (scheduled, cheap model)
- Cron/idle job runs `distill.py` on the models.yaml `distiller` role (cheap tier).
- Reads inbox + an index of existing lessons; outputs PROPOSALS (create /
  patch / deprecate), each citing source events, with confidence and scope.
- Proposals are files written under `memory/pending/<scope>/<type>/`.

## 3. Apply (gated)
- Nothing in `pending/` is ever loaded into an agent's context.
- A human reviews (git diff is the UI): move the file out of `pending/` into the
  scope tree and set `status: approved`, or delete it.
- Optional policy: auto-approve ONLY user-scope, confidence >= 0.9,
  non-procedural items. Team/app scope always requires a human.

## 4. Verify (before apply completes)
- Safety-scan every proposal (safety_scan task slot or regex pass): prompt-
  injection phrases, exfiltration patterns, invisible Unicode → reject.
- A proposal may not grant the agent new permissions or alter the loop itself.
- If a test harness exists for the behavior, run it; keep only what improves it.
- Remember: a person's real decision is the one signal that can't be faked.
  Automatic scores can be gamed — treat them as advisory, humans as ground truth.

## 5. Curate (weekly, deterministic + cheap model)
- `scripts/memory_lint.py` flags: past review_by, stale pending items, missing
  frontmatter, dangling supersedes, MEMORY.md over capacity.
- The `curator` role (cheap tier) reviews flagged items: re-verify, merge
  duplicates, extend review_by, or move to `archive/` with `status: deprecated`.
- Consolidation ("dreaming"): promote repeated episodic patterns into
  procedural lessons; compress MEMORY.md above 80% capacity.

## Cadence defaults
distill: hourly or on idle · lint: daily · curate: weekly · human review: as-needed queue
