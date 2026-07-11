# Lyceora — Development Report & Session Handoff

**Date:** 2026-07-11 · **State:** M1 built, reviewed, merged to `main` (`8c5c17e`), pushed to https://github.com/Andrea-C/lyceora · **Deployment:** not yet provisioned (see [Outstanding work](#outstanding-work))

This document is the entry point for anyone (human or AI agent) resuming work on Lyceora. It records what was built, how, what was decided along the way, and where every other document lives. The original per-task orchestration ledger and review reports lived in `.superpowers/` (git-ignored, session-local); their substance is distilled here.

---

## 1. What Lyceora is

An adaptive, bilingual (Italian/English) math-learning platform in the style of Math Academy: knowledge-graph mastery learning, an AI Socratic teacher, AI-generated exercises, spaced repetition, and XP gamification. **User #1 is a 13-year-old Italian student who must recover a math insufficiency (8 teacher-assigned topics) during summer 2026** — M1 exists to serve him; the startup platform grows around that.

## 2. Document map — read in this order

| Document | What it contains |
|---|---|
| `docs/ai-teacher-scratchpad.md` | The original raw idea notes from Andrea (product vision, references). |
| `docs/Math/programma-matematica-estate-2026-progetto.md` | The professor's 8 recovery topics — the source of the M1 learning path. |
| `docs/Math/Risorse-Recupero-Matematica-Medie.md` | Curated-resources research (videos/exercises per topic) that seeded `resources.json`; also the math-anxiety pedagogy notes that shaped the teacher's tone rules. |
| `docs/superpowers/specs/2026-07-11-lyceora-platform-design.md` | **The approved product spec** — architecture, pedagogy model, agent roster, milestones M1–M3, out-of-scope list. Normative. |
| `docs/design/learning-engine.md` | Deep design: DB schema rationale, mastery state machine, diagnostic algorithm, composer/routing/spaced repetition, with a verified worked scenario. Carries a 2026-07-11 amendment note where the implementation corrected the pseudocode (see §5). |
| `docs/design/math-it-media-extension.md` | Deep design: the 60-micro-topic decomposition of the 8 recovery topics, all 156 graph edges, 2 fully-worked exemplar topics, the 33 curated-resource records, coverage/gap analysis vs upstream os-taxonomy. |
| `docs/superpowers/plans/2026-07-11-lyceora-m1.md` | **The 18-task implementation plan** (TDD steps, full reference code). Historical: the code on `main` supersedes it where reviews forced corrections (§5). |
| `README.md` | Current run/dev/test/deploy instructions. Accurate as of this report. |
| `CLAUDE.md` | Orchestration conventions for AI sessions in this repo (orchestrator + deep-reasoner/fast-worker subagents). `.claude/agents/` and `.claude/skills/self-improving-agents/` are committed and referenced by it. |
| This file | History, decisions, deviations, current state, outstanding work, M2 backlog. |

## 3. How M1 was built (process history)

1. **Brainstorm → spec** (superpowers:brainstorming): scope questions resolved with Andrea — thin vertical slice, Math, ages 8–15, bilingual from day one, hybrid content, TypeScript stack, startup posture, modular-monolith architecture. Spec approved and committed.
2. **Design phase**: two deep-reasoner agents produced the learning-engine design and the taxonomy-extension design in parallel (both committed under `docs/design/`, both machine-verified — DAG checks, reachability, anchor-ID existence against upstream data).
3. **Planning** (superpowers:writing-plans): the 18-task plan with verbatim code and tests, cross-task interfaces reconciled up front.
4. **Execution** (superpowers:subagent-driven-development): one fresh implementer subagent per task, an independent reviewer per task, fix→re-review loops until approved, a progress ledger, and a final whole-branch review on the most capable model. ~48 commits on `feature/m1`, merged `--no-ff` to `main`.

## 4. Per-task outcome summary

| Task | Outcome (fix rounds) |
|---|---|
| 1 Monorepo scaffold | ✅ (1 fix: root test script passWithNoTests) |
| 2 Taxonomy schema/loader | ✅ (1: standalone tsconfig; duplicate-id rejection) |
| 3 Graph engine | ✅ (1: precise cycle-path reporting; edge-case regression tests) |
| 4 Vendor os-taxonomy + math-core (228 topics, full Italian overlay) | ✅ (2: **schema type vocabulary corrected** — see §5; PROVENANCE wording; Italian number-notation sweep) |
| 5 Provider registry (models.yaml, tiered fallback) | ✅ (1: vitest dep, node≥22 engines, broader transient-error classifier) |
| 6 math-it-media content (60 topics authored bilingually) | ✅ (1 **Critical**: a false divisibility-by-11 example, fixed to 2938) |
| 7 Curated resources (33 records) | ✅ (follow-up: explicit cluster map in coverage test) |
| 8 DB package (13 tables + migrations, PGlite tests) | ✅ (1: lockfile, daily_activity uniqueness test, dep ranges) |
| 9 Mastery state machine | ✅ first pass |
| 10 Adaptive diagnostic reducer | ✅ (implementer fixed **two genuine bugs in the plan's reference algorithm** — see §5) |
| 11 Composer/routing/reviews/XP | ✅ (1 **Critical**: needsReview leaf topics leaked into new-content tier; deepest-first ordering; whole-block cap) |
| 12 Assessor agent | ✅ first pass |
| 13 Teacher + AG-UI + signals | ✅ (1: `ModelMessage[]` typing) |
| 14 Web app scaffold (Next 16, next-intl, Better Auth, profiles) | ✅ (1 **Critical**: profile-cookie set without ownership check) |
| 15 Services + API routes | ✅ (3 rounds, 1 **Critical**: client-echoed exercise grading → replaced with server-side exercise custody; plus idempotency, ownership predicates, attribution passthrough, difficulty/kind pinning, atomic claim) |
| 16 Student & parent UI | ✅ (1: taxonomy domain labels localized) |
| 17 Fakes + Playwright E2E + evals | ✅ first pass (+ small robustness commit) |
| 18 Deploy | ⏳ config/docs authored; **cloud provisioning outstanding** (§7) |
| Final whole-branch review | "Ready to merge" after one fix wave (`baeed59`): plan-bound XP idempotency, serve caps, localized error UX |

## 5. Decisions & deviations that supersede the plan/design docs

These were discovered during execution; the code on `main` is authoritative:

- **Topic type vocabulary** is `CONCEPTUAL | PROCEDURAL | REPRESENTATIONAL | LANGUAGE | META` (upstream os-taxonomy's real vocabulary). The plan's original enum was wrong and was fixed at the schema layer (Task 4 review).
- **Diagnostic algorithm**: the design doc's pseudocode had two bugs, corrected in `packages/engine/src/diagnostic.ts` and annotated in `docs/design/learning-engine.md` — worklist ordering (breadth across targets first; a pure level-sort starves shallow siblings) and finalize (iterative downward propagation of `assumedUnmastered`).
- **Composer semantics** (Task 11 review): remediation tier takes ALL `needsReview` topics (blocking-first, deepest-first via shared `topoLevels`); frontier is `unknown|inProgress` only; per-plan topic dedupe; whole-block 12-item cap; full re-teach block when `lapses ≥ 2 OR totalAttempts ≤ 2` (false-test-out heuristic).
- **Exercise custody** (Task 15 reviews — the most consequential change): exercises are persisted server-side (`served_exercise` table) and clients receive **redacted** payloads (no `correctAnswer`/`explanation`); grading uses only the stored record via an atomic claim; diagnostic uses an exercise-id nonce; XP is idempotent per plan item (`consumedItems` in `planJson`, CAS update); serving is capped at 3 per plan item.
- **Next.js 16 adaptations** (plan assumed 15): `middleware.ts` → `proxy.ts`; relative imports in all packages dropped `.js` extensions for Turbopack.
- **Local dev without Docker**: PGlite socket server (`pnpm --filter @lyceora/db db:dev`, port 5502) is the dev/E2E database; `LYCEORA_FAKE_MODELS=1` runs the entire product deterministically with zero API keys (switch confined to `apps/web/src/server/registry.ts`).
- **No cron in M1** (spec §5 deviation): reviews become due by date comparison at compose time; no background job exists or is needed.
- **AI SDK majors**: `ai@7` / `@ai-sdk/*@3` (plan said v5); Node engine floor is `>=22`.

## 6. Current verified state

- `pnpm test`: **98/98** across 5 packages/apps (PGlite-backed integration tests included).
- `pnpm --filter web exec playwright test`: **1/1** — full acceptance flow (signup → child profile → diagnostic → session with lesson + graded exercise + XP → teacher chat streaming → locale switch), deterministic fakes, stable across repeated runs.
- `next build`, `eslint`, per-package `tsc --noEmit`: clean. Production-mode `next start` smoke passed (401 not 500 on unauthenticated APIs — certifies bundled `models.yaml` resolution).
- Security posture verified by review: single tenant gate (`getOwnedProfile`) on every route/action/page, exercise custody, XP idempotency, no secrets in history.

## 7. Outstanding work

**Task 18 — deployment (blocked on account owner):**
1. Neon project (`eu-central-1`), Vercel project (root dir `apps/web`, repo already on GitHub).
2. Env vars: `DATABASE_URL`, `BETTER_AUTH_SECRET` (fresh 40+ chars), `BETTER_AUTH_URL`, `ANTHROPIC_API_KEY` (+ optional other providers).
3. `pnpm --filter @lyceora/db db:migrate` against the prod `DATABASE_URL`.
4. **Live eval run** (required gate before the student uses it): `pnpm --filter @lyceora/agents evals` with a real key — record the pass/fail table.
5. Deploy, run the README smoke checklist in both locales, then `git tag m1 && git push --tags`.

**M2 backlog seeds** (from the final review triage): rate limiting + plan-scoping for the teacher stream and signals route; localized API error bodies; `dailyXpGoal` settings UI; mid-session resumption; DB CHECK constraint on difficulty; full os-taxonomy math import (ages 8–11); curator agent for resource discovery; richer spaced repetition; badges; parent reports. **M3**: the self-improving loop (distiller over the already-accumulating `learning_signal` table — see `.claude/skills/self-improving-agents/`).

## 8. Resuming development — checklist for a new session

1. Clone; Node ≥ 22, pnpm 10 (`corepack enable pnpm`), `pnpm install`.
2. `pnpm --filter web exec playwright install chromium` (for E2E).
3. Terminal 1: `pnpm --filter @lyceora/db db:dev` · then `pnpm --filter @lyceora/db db:migrate`.
4. `apps/web/.env.local`: `DATABASE_URL=postgres://postgres:postgres@localhost:5502/postgres`, `BETTER_AUTH_SECRET=<any 40 chars>`, `BETTER_AUTH_URL=http://localhost:3000`; add `LYCEORA_FAKE_MODELS=1` for keyless work.
5. `pnpm dev` → http://localhost:3000/it · verify with `pnpm test` and `pnpm --filter web exec playwright test`.
6. Read the spec, then this report's §5 before trusting the plan/design docs on any point they disagree with the code.

Known environment quirks: repo developed on Windows (PowerShell) — scripts are cross-platform; root `pnpm typecheck` (`tsc -b`) is not wired (no root tsconfig; per-package `tsc -p` and `next build` are the working checks); `vitest.workspace.ts` format is deprecated in vitest 3 (works, migrate to `test.projects` eventually).
