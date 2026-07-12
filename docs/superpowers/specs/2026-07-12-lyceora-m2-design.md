# Lyceora M2 — Design

**Date:** 2026-07-12 · **Status:** approved by Andrea (scope: "Spec-faithful M2", design sections A–G approved as presented) · **Predecessor:** `2026-07-11-lyceora-platform-design.md` (M1 spec, normative for everything not restated here) · **State of the world:** M1 live at https://app.lyceora.ai (tag `m1`), tests 101/101, live eval gate 9/9.

## Context

M1 shipped the thin vertical slice for user #1 (13-year-old, 8-topic summer recovery path, Italian). The M1 spec defines M2 as: full os-taxonomy math import (ages 8–11), curator agent for automated resource discovery, richer spaced repetition, badges, parent progress reports. Andrea chose this spec-faithful scope over a hardening-first alternative, with review-triage hardening items included only where cheap.

**Decisions made during scoping** (Andrea, 2026-07-12):
- Scope: all five spec items; hardening where cheap (§F); mid-session resumption deferred to M2.5.
- Curator search backend: **Anthropic web_search** server tool (existing `ANTHROPIC_API_KEY`, no new accounts; build-time only).
- Deferred out of M2: mid-session resumption, email/digest reports, non-math subject import, badge levels/certificates beyond the initial set.

## Scope

**In:** §A import (275 math topics), §B curator agent, §C richer spaced repetition, §D badges, §E parent reports, §F cheap hardening, §G testing, §H delivery.
**Out (deferred):** mid-session resumption (M2.5); email reports; importing non-math subjects; FSRS-style scheduling; badge certificates/levels; curator running in CI (it runs on demand on Andrea's machine).

---

## A. Taxonomy import — remaining os-taxonomy math (ages 4–11)

**Facts:** upstream `packages/taxonomy/data/os-taxonomy/topics.json` holds 1,590 topics (503 Mathematics). 228 are already imported (`math-core.json`) with full Italian overlay. **275 math topics remain**, 251 in the 8–11 band, the rest younger (4–8). We import all 275 ("full math import"); the band label in the M1 spec is shorthand for "the primary band below math-core".

**Approach (chosen):** build-time import script + committed JSON artifacts, mirroring M1's vendor pipeline. Rejected: runtime DB-backed content (diverges from committed-data architecture); manual translation (275 topics is not hand-translatable in milestone time).

**Deliverables:**
1. `packages/taxonomy/scripts/import-math-junior.ts` — reads upstream `topics.json` + `dependencies.json`, selects Mathematics topics not present in `math-core.json`, emits `packages/taxonomy/data/math-junior.json` (same schema as `math-core.json`: id, type from the `CONCEPTUAL|PROCEDURAL|REPRESENTATIONAL|LANGUAGE|META` vocabulary, name/description/evidence as `{it,en}`, ageRange, edges).
2. **Model-assisted Italian overlay**: a build-time translation script (strong tier / Sonnet via the existing registry) fills the `it` fields for the 275 topics (name, description, evidence items), honoring the M1 Italian conventions (comma decimals, middle-school register, pedagogy tone rules from the Risorse report). Output is committed; Andrea spot-reviews a sample (the lint below is the systematic gate).
3. **Validation as tests** (extend `packages/taxonomy/test/`): merged-graph DAG check, reachability, no dangling edges across `math-core` ∪ `math-junior` ∪ `math-it-media`, duplicate-id rejection, anchor existence versus upstream — same battery as M1 Task 4 — plus a **translation lint**: `it` fields non-empty, no English stopword hits (`\b(the|and|which|of|to)\b` class), Italian decimal notation in numeric examples, length within 0.5×–3× of the `en` source.
4. **Loader change**: `packages/taxonomy` loader merges the three data files into one graph. Upstream dependency edges attach the junior band below the current floor, so the adaptive diagnostic can descend into primary-school gaps with no diagnostic-code changes (worklist already walks arbitrary-depth prerequisite chains).

**Non-goals:** no new learning-path definitions for the junior band in M2 (the topics serve as diagnostic/remediation substrate); no curated resources guaranteed for junior topics (curator §B fills what it can).

## B. Curator agent (build-time resource discovery)

**Purpose:** replace manual curation (M1: 33 hand-curated records over 60 authored topics) with an agent that proposes candidate resources per topic; a human approves. Never runs in production serving; never auto-commits.

**Design:** `packages/agents/src/curator.ts` + CLI entry (`pnpm --filter @lyceora/agents curate -- --topic <id> | --all [--locale it|en] [--budget <usd>] [--max-searches-per-topic N]`).

Per topic pipeline:
1. **Search** — Anthropic Messages API with the `web_search` server tool (model: assessor/standard tier is sufficient; registry-resolved), queries built from the topic's `{it}` name + evidence criteria; Italian-first, English fallback.
2. **Extract candidates** — structured output listing url, title, kind (`video|exercise|article`), language, claimed level.
3. **Validate** — (a) liveness: HTTP HEAD/GET status < 400 (plain fetch, no model); (b) language + level fit: model judges the candidate against the topic's evidence criteria and age range; (c) dedupe against existing `resources.json` records.
4. **Emit for review** — append to `packages/taxonomy/data/curated-review/<date>-proposals.json` conforming to the existing curated-resource schema plus `{ sourceQuery, validationNotes }`. Andrea reviews and moves approved records into `resources.json` (a small `promote` script assists: `--accept id1,id2,…`).

**Cost & safety rails:** hard budget cap per run (default $3; abort when estimated spend exceeds it — track from usage fields), per-topic search cap (default 3), resumable via a progress file keyed by topic id (re-runs skip completed topics), deterministic record ids (`res_<topicid>_<hash(url)>`). Kid-safety guardrails prompt (`prompts/guardrails.ts`) applies to the judging step; domains blocklist/allowlist file consulted before validation to skip junk domains.

**Testing:** the pipeline's pure parts (query construction, candidate schema validation, dedupe, id derivation, budget accounting) get unit tests with fixtures; the model+network steps are behind a port interface with a fake (same pattern as `fake.ts`), so the CLI is testable end-to-end offline. A manual eval run (like `evals`) exercises one real topic when a key is present, SKIP otherwise.

## C. Richer spaced repetition

Designed and contract-verified by deep-reasoner against `packages/engine/src/review.ts`, `compose.ts`, `mastery.ts`, and `apps/web/src/server/services/session.ts`. **Zero schema changes; composer untouched; existing rows remain valid.** Full analysis (worked scenario, rejected alternatives, risks) is preserved below; the code contracts are:

### C1. Streak-aware promotion (`applyReviewOutcome`)

Add an optional 4th arg; existing positional callers unchanged:

```ts
export const FAST_PROMOTE_STREAK = 4;
export const FAST_PROMOTE_STEP = 2;
export function applyReviewOutcome(
  row: ReviewRow, passed: boolean, today: string, opts: { masteryStreak?: number } = {}
): ReviewRow
```

- Pass: `step = (opts.masteryStreak ?? 0) >= 4 ? 2 : 1`; `rung = min(rung + step, LADDER.length - 1)`; `dueOn = today + LADDER[rung]`.
- Fail: byte-for-byte identical to current behavior (−1 rung, lapse++, due today, suspend at 2 lapses). A streak can never soften a lapse.
- `masteryStreak` source: `mastery_state.consecutiveCorrectAtLevel` **after** the current evidence fold (`after.consecutiveCorrectAtLevel` at the `session.ts:173` call site; the review-bookkeeping block must stay after the `applyEvidence` call — see Risks).

### C2. Implicit review (credit-only, direct hard prerequisites only)

```ts
export function applyImplicitReview(
  input: { row: ReviewRow; masteryStatus: MasteryStatus }, today: string
): ReviewRow
export function computeImplicitReviews(
  directHardPrereqIds: string[],
  reviewRowOf: (topicId: string) => ReviewRow | undefined,
  masteryStatusOf: (topicId: string) => MasteryStatus,
  today: string
): ReviewRow[]
```

- On a **correct** exercise/assessment/review on topic T: for each **direct hard prerequisite** of T that is currently `mastered`, not suspended, and already in the review rotation, push `dueOn` out to `max(dueOn, today + LADDER[currentRung])`. Rung never changes; rows are never created; `needsReview`/`suspended` prerequisites are never touched (so implicit credit cannot prop up a lapsed foundation).
- Wrong answers give no implicit credit and never demote prerequisites (that is `routeNext`'s job; the branches are mutually exclusive).
- Service integration: in `completeActivity` after the review-bookkeeping block, gated on `graded.correct`; direct-hard-prereq ids derived exactly as the existing `candidateConcepts` computation (`session.ts:110-112`); two thin repo reads (`getReviewRows`, mastery statuses); `UPDATE review_queue SET due_on` per changed row.

**Explicitly rejected (kept for the record):** difficulty-scaled promotion (composer serves all reviews at difficulty 2 and mastery demotes on any miss, making the difficulty lever inert-or-harmful); transitive credit with depth decay (widens the blast radius of suppressed reviews exactly where a recovery student's false mastery hides; direct-only self-heals one hop per explicit review); new `consecutivePasses` column (reuse `consecutiveCorrectAtLevel`, zero migration); FSRS/SM-2 (no data yet); penalizing overdue-unanswered reviews (contradicts the established rule); implicit-creating rows (queue-explosion risk).

**Worked scenario** (chain `pitagora →hard→ radici →hard→ potenze`, today 2026-07-12; radici {rung 2, due 07-15}, potenze {rung 2, due 07-12, streak 5}):
1. Correct `pitagora` exercise → radici (direct prereq) refreshed to 07-19; potenze (grandparent) untouched.
2. `potenze` review passes → streak 6 ≥ 4 → +2 rungs → rung 4, due 08-11 (skips the 14-day rung).
3. On 07-19 `radici` review **fails** → needsReview, streak 0, rung 1, lapse 1. From now on correct `pitagora` work does **not** refresh radici (gate: masteryStatus ≠ mastered), so radici surfaces as tier-1 remediation and re-masters at +1 pace (streak reset — no rocket-back).

**Unit tests (15, from the verified design):** streak <4 → +1 (legacy regression); streak ≥4 → +2; rung-cap adversarial (rung 4+step 2 → 5 not 6; rung 5 stays 5 — guards `LADDER[rung]` from undefined→NaN); post-lapse re-mastery with streak 2 → +1 only; fail with streak 10 → full lapse path; implicit refresh push-out; needsReview no-op; suspended no-op; missing row → no creation; rung-0 confirm-review not extended (protects the 1-day false-test-out confirmation); monotonicity (never pulled earlier); direct-only (grandparent untouched); determinism; plus 2 service-level integration tests (push-out without row creation; no refresh after lapse).

## D. Badges

**Definitions in code**, awards in DB:
- `packages/engine/src/badges.ts`: `BADGE_DEFINITIONS` (id, `{it,en}` name + description, criteria params) + a **pure evaluator** `evaluateBadges(snapshot: BadgeSnapshot, alreadyEarned: Set<string>): string[]` returning newly earned badge ids. `BadgeSnapshot` carries: totalXp, currentStreak, masteredCount, domainsCompleted (domain → all-path-topics-mastered), reviewsPassedTotal, cameBackAfterLapse (a review pass on a topic with lapses ≥ 1), diagnosticCompleted, goalMetDays.
- `packages/db`: new table `awarded_badge` (id, profileId FK, badgeId text, awardedAt timestamptz, `UNIQUE(profileId, badgeId)`). Migration additive.
- **Service integration:** one `checkAndAwardBadges(db, profileId)` service assembling the snapshot from existing tables (xp_event, daily_activity, mastery_state, review_queue, evidence_record, learning_session) and inserting new awards idempotently (`ON CONFLICT DO NOTHING`). Called after: XP award, streak update, mastery transition, review outcome, diagnostic finalize. Returns newly-awarded ids so routes can surface them.
- **Initial set (10):** `primi-passi` (diagnostic complete), `streak-3`, `streak-7`, `streak-14`, `streak-30`, `prima-maestria` (first mastered topic), `costellazione` (first domain cluster complete), `ripasso-10` (10 review passes), `rimonta` (pass a review on a topic that had lapsed — celebrates recovery, anxiety-aware pedagogy), `obiettivo-5` (daily XP goal met 5 distinct days). Copy is non-judgmental, no rankings, no "top student" framing (Risorse pedagogy rules).
- **UI:** badge case section on the home page (earned = full color, unearned = muted outline with name only — no shaming counters); an award **toast** in the session flow when an activity response carries newly-awarded ids; "recent badges" strip on the parent page. All strings via next-intl in both locales.

## E. Parent progress reports

Enrich the existing parent area (`/[locale]/app/parent`), computed at request time from existing tables (no cron, no email in M2):
- **Per-domain mastery bars** per child (reuse the home-page progress computation).
- **14-day activity chart** from `daily_activity` (xpEarned per day vs goal; simple inline SVG bars, no chart lib).
- **Recent badges** (from §D).
- **"Da rivedere insieme"** ("worth revisiting together") list: topics currently `needsReview` or with lapses ≥ 1, phrased non-judgmentally, max 5, deepest-first (same ordering the composer uses).
- **Weekly summary block**: XP this week vs last, sessions count, topics mastered this week, reviews passed.

## F. Hardening (the "where cheap" set)

1. **Difficulty CHECK constraint**: migration adding `CHECK (difficulty BETWEEN 1 AND 3)` to `served_exercise` (and any other difficulty-typed column).
2. **Generator numbers fix** (from the 2026-07-12 production smoke): one prompt line in `exerciseGenPrompt` — numeric word problems must have exact, cleanly computable answers (no ambiguous rounding: the "2.5 kg in 200 g bags" failure class).
3. **`dailyXpGoal` settings UI**: small parent-gated form (profiles page card), server action with `getOwnedProfile` check, bounds 10–200, localized.
4. **Rate limiting** on `/api/agent` and `/api/learning/signals`: fixed-window per-profile counters in a new `rate_limit_window` table (profileId, route, windowStart, count; upsert-increment; 1h window), limits 30/h (agent) and 120/h (signals), env-overridable; 429 with localized error envelope. Serverless-safe (Postgres-backed, atomic upsert).
5. **Plan-scoping the agent route**: the teacher stream request's topicId must belong to the caller's active session plan (same predicate family as the exercise route).
6. **Localized API error envelopes**: UI-consumed routes return `{ error: { code } }`; client maps code → next-intl message (extend the existing localized-error pattern from `baeed59`).

## G. Testing

- **Unit** (vitest, no network): SR (15 scenarios §C), badges evaluator (edge: idempotency, multi-award in one check, domain-completion boundary), import validators + translation lint (fixtures with seeded errors), curator pure parts (fixtures), rate-limit window math.
- **Integration** (PGlite): badge award service (snapshot assembly + idempotent insert), implicit-review service path (2 scenarios §C), rate limiter (429 after N), dailyXpGoal action (ownership + bounds).
- **E2E** (Playwright, fakes): badge toast appears after first mastery in the fake flow; parent page renders report sections; settings form round-trip.
- **Evals**: unchanged 9/9 gate; one curator manual eval (real key, single topic, SKIP without key).
- **Import artifacts**: validation battery runs as part of `pnpm test` (it's just tests over committed JSON).

## H. Delivery & process

- Branch `feature/m2`; M1 process: one fresh implementer subagent per task, independent reviewer per task, fix→re-review loops, final whole-branch review; merge `--no-ff` to `main` → Vercel auto-deploys production.
- Suggested build order: F (small, unblocks everything) → C (engine, pure) → D (schema + engine + service + UI) → E (UI over existing data) → A (import + translation + validation) → B (curator, consumes A's topics).
- Content steps that spend money (translation ~275 topics, curation runs) execute on Andrea's machine with his key, inside the budget caps; artifacts land as commits he can inspect.
- New-session bootstrap docs (report §8) unaffected; `LYCEORA_FAKE_MODELS=1` continues to run everything deterministically (curator CLI included, via its fake port).

## Risks

- **SR/streak coupling:** `consecutiveCorrectAtLevel` only increments when review difficulty ≥ `targetDifficulty` (both 2 today). Raising a topic's `targetDifficulty` later silently disables fast-promote for it — degrades safe (legacy +1), but worth a code comment at the call site. The `masteryStreak` arg must be read **after** the `applyEvidence` fold (order dependency at `session.ts:149→173`).
- **Translation quality at 275 topics:** lint catches structure, not pedagogy. Mitigation: Andrea samples ~20; the junior band initially serves only diagnostics/remediation, not authored lessons.
- **Curator result quality:** web_search results vary; the human-approval gate is the backstop, budget caps bound the cost.
- **Import graph shape:** upstream edges could create cross-band cycles or unreachable islands; the validation battery (DAG/reachability) gates the commit, and the import script must fail loudly rather than skip-silently.

## Acceptance criteria

M2 is done when: all tests green (existing 101 + new); merged graph loads 503 upstream math topics + 60 authored with valid DAG; the 275 new topics have lint-clean Italian overlays; curator CLI produces a reviewed-and-promoted batch of ≥ 20 new resource records; badges award and render end-to-end (E2E proof); parent report sections render with real data; rate limits return localized 429s; eval gate still 9/9; deployed to production and smoke-checked in both locales.
