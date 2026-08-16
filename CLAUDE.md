## Orchestration workflow  
You (Fable) are the orchestrator. Plan, decompose, synthesize.  
Reasoning-heavy phases -> deep-reasoner  
Mechanical work -> fast-worker  
Web research for learning resources -> web-researcher (fan out in parallel, one topic each; merge via packages/agents/curate/research-merge.ts)  
Codex (/codex:rescue --background) is a cracked engineer on par with deep-reasoner, from a different perspective. Treat as a peer, not a reviewer.  
High-stakes decisions: task Opus + Codex on the same problem in parallel, synthesize the best of both, without showing either the other's answer. Keep your own context lean.   

## DevOps

**Build/test** — pnpm monorepo, Node ≥22. On this Mac `pnpm` is not on PATH: use `npx --yes pnpm@10.0.0 …`. Root `pnpm typecheck` fails (no root tsconfig — pre-existing gap); typecheck/test per package instead: `pnpm --filter @lyceora/taxonomy|@lyceora/agents|web test`. Full build: `pnpm -r build` (verified green on this machine).

**Deploy** — push to `main` on GitHub (`Andrea-C/lyceora`) → Vercel auto-builds and deploys `apps/web` (project linkage in gitignored `.vercel/project.json`). Database: Neon Postgres (eu-central-1). Production migrations: export `DATABASE_URL` (Neon URL) in that shell only, then `pnpm --filter @lyceora/db db:migrate`. Firebase/GCloud are NOT used by this project.

**Secrets** — all gitignored, never commit: `docs/setup-notes.md` (Neon connection URLs + Anthropic API key — the canonical secrets note), `apps/web/.env.local` and `packages/db/.env` (local dev: `DATABASE_URL` points at the localhost PGlite dev server from `db:dev`; keep it that way so `db:migrate` can't hit prod by accident). Production env vars live in the Vercel dashboard.
