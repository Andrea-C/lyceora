# Lyceora M1 — Learning Engine & Database Schema Design

Scope: the four deliverables requested — (1) Drizzle schema, (2) mastery state machine,
(3) adaptive diagnostic algorithm, (4) session composer + routing + spaced repetition —
plus a concrete verification walkthrough. Targets M1 (thin vertical, one Math path,
usable by user #1 in 2-3 weeks). Grounded in the approved spec
(`docs/superpowers/specs/2026-07-11-lyceora-platform-design.md`) and the professor's
8-topic recovery plan (`docs/Math/programma-matematica-estate-2026-progetto.md`).

## 0. Cross-cutting decisions (read first)

- **Tenant = parent account.** The Better Auth `user.id` (a parent) is the tenant root.
  Every domain row is reachable to exactly one owner via `profile.ownerUserId`. There is no
  separate `tenant`/`org` table in M1 (YAGNI). Isolation is enforced in a thin repository
  layer that *always* filters by `ownerUserId`/`profileId`. Future B2B (schools): add an
  `organization` table and an `organizationId` column on `profile`; nothing else changes
  because all reads already scope through `profile`.
- **Topics live in JSON, not the DB.** All `topicId` columns are `text` holding os-taxonomy
  IDs (`"mt_XXXX"`). No FK to a topics table — `packages/taxonomy` owns the graph in memory.
  This is deliberate: topic content ships with the build, is versioned in git, and is queried
  by pure functions; the DB only stores *per-student state keyed by topic ID*.
- **Evidence is an append-only ledger.** `evidence_record` rows are immutable. Mastery,
  XP totals, and streaks are *projections* over ledgers (evidence, xp_event, daily_activity).
  `mastery_state` stores a cached projection + rolling counters so the composer reads O(1),
  but it can always be rebuilt from the evidence ledger (important when thresholds change).
- **`unknown` mastery is the absence of a row OR an explicit row.** Reads treat a missing
  `(profile, topic)` row as `unknown`. The diagnostic and lessons materialize rows lazily.
- **All content-facing text is bilingual.** DB stores IDs/enums/numbers only; human-readable
  strings (names, questions, rubric) either come from taxonomy JSON (`{it,en}`) or are stored
  as produced (question/answer text is language-tagged via the profile's `locale`).
- **Money quote on multi-tenancy:** the only thing that makes this "startup-real" rather than
  a single-user toy is the mandatory owner-scoping + the fact that every table is designed to
  hold N profiles across M parents from row one. That is present; further tenancy is deferred.

## 1. Drizzle schema (`packages/db/src/schema.ts`)

Postgres dialect (Neon in prod, PGlite in unit tests — both speak the same SQL; avoid
Neon-only features). `gen_random_uuid()` (pgcrypto, available in Neon + PGlite) backs
`defaultRandom()`. Better Auth's drizzle adapter generates `user`, `session`, `account`,
`verification` tables itself; we import only `user` to FK against it.

```ts
import {
  pgTable, pgEnum, uuid, text, integer, boolean, numeric,
  timestamp, date, jsonb, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
// Better Auth-generated table (do NOT redefine it here; import its reference):
import { user } from "./auth-schema"; // { id: text (PK), email, name, ... }

/* ---------- enums ---------- */
export const localeEnum          = pgEnum("locale", ["it", "en"]);
export const masteryStatusEnum   = pgEnum("mastery_status",
  ["unknown", "inProgress", "mastered", "needsReview"]);
export const evidenceSourceEnum  = pgEnum("evidence_source",
  ["diagnostic", "lesson", "exercise", "assessment", "review"]);
export const sessionKindEnum     = pgEnum("session_kind", ["diagnostic", "daily"]);
export const sessionStatusEnum   = pgEnum("session_status",
  ["active", "completed", "abandoned"]);
export const enrollmentStatusEnum = pgEnum("enrollment_status",
  ["active", "completed", "paused"]);
export const xpReasonEnum        = pgEnum("xp_reason", [
  "lessonComplete", "exerciseCorrect", "assessmentPass",
  "reviewComplete", "diagnosticComplete", "streakBonus", "goalBonus",
]);

/* ---------- 1. profiles (child) ---------- */
export const profile = pgTable("profile", {
  id:          uuid("id").primaryKey().defaultRandom(),
  // TENANT ROOT: FK to Better Auth parent account.
  ownerUserId: text("owner_user_id").notNull()
                 .references(() => user.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(), // child FIRST NAME only (min PII / COPPA-GDPR)
  birthYear:   integer("birth_year"),          // year only -> age-range filtering, minimal PII
  locale:      localeEnum("locale").notNull().default("it"),
  timezone:    text("timezone").notNull().default("Europe/Rome"), // for local-day streak calc
  dailyXpGoal: integer("daily_xp_goal").notNull().default(30),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastActiveOn:  date("last_active_on"),        // last local date that met/contributed goal
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
               .$onUpdate(() => new Date()),
}, (t) => ({
  byOwner: index("profile_owner_idx").on(t.ownerUserId),
}));

/* ---------- 2. enrollment (profile -> JSON-defined path) ---------- */
// Minimal, but required: composeSession/diagnostic need to know the active path's
// target topic set. Path DEFINITIONS live in taxonomy JSON; this is just the pointer.
export const enrollment = pgTable("enrollment", {
  id:        uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id").notNull()
               .references(() => profile.id, { onDelete: "cascade" }),
  pathId:    text("path_id").notNull(),         // e.g. "path_recupero_media" (JSON)
  status:    enrollmentStatusEnum("status").notNull().default("active"),
  diagnosticSessionId: uuid("diagnostic_session_id"), // set when diagnostic completes
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqProfilePath: uniqueIndex("enrollment_profile_path_uniq").on(t.profileId, t.pathId),
}));
```

```ts
/* ---------- 3. mastery state (per profile per topic) ---------- */
// Cached projection of the evidence ledger + rolling counters that drive the state machine.
// Rebuildable from evidence_record. `unknown` may be absent (no row) or explicit.
export const masteryState = pgTable("mastery_state", {
  id:        uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id").notNull()
               .references(() => profile.id, { onDelete: "cascade" }),
  topicId:   text("topic_id").notNull(),        // os-taxonomy "mt_XXXX" (no FK — JSON graph)
  status:    masteryStatusEnum("status").notNull().default("unknown"),
  // rolling counters (incremental fold — see applyEvidence). "AtLevel" = difficulty >= target.
  consecutiveCorrectAtLevel: integer("consecutive_correct_at_level").notNull().default(0),
  totalCorrect:  integer("total_correct").notNull().default(0),
  totalAttempts: integer("total_attempts").notNull().default(0),
  lapses:        integer("lapses").notNull().default(0), // times demoted from mastered
  masteredAt:     timestamp("mastered_at", { withTimezone: true }),
  lastEvidenceAt: timestamp("last_evidence_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
               .$onUpdate(() => new Date()),
}, (t) => ({
  uniqProfileTopic: uniqueIndex("mastery_profile_topic_uniq").on(t.profileId, t.topicId),
  byProfileStatus:  index("mastery_profile_status_idx").on(t.profileId, t.status),
}));

/* ---------- 4. evidence records (append-only, one row per graded item) ---------- */
export const evidenceRecord = pgTable("evidence_record", {
  id:        uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id").notNull()
               .references(() => profile.id, { onDelete: "cascade" }),
  topicId:   text("topic_id").notNull(),
  sessionId: uuid("session_id")
               .references(() => learningSession.id, { onDelete: "set null" }),
  source:    evidenceSourceEnum("source").notNull(),
  isCorrect: boolean("is_correct").notNull(),
  difficulty: integer("difficulty").notNull(),  // 1..5 band the item was posed at
  score:     numeric("score", { precision: 4, scale: 3 }), // 0..1 partial credit (free-form)
  promptRef: text("prompt_ref"),                // assessment-template id or generated-item id
  question:  text("question"),                  // rendered question (locale of profile)
  studentAnswer: text("student_answer"),
  rubricNotes:   text("rubric_notes"),          // Assessor's rationale / error analysis
  attributedConcepts: jsonb("attributed_concepts").$type<string[]>(), // concept/topic tags
  derived:   boolean("derived").notNull().default(false), // true = inferred (e.g. prereq demote)
  responseMs: integer("response_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byProfileTopicTime: index("evidence_profile_topic_time_idx")
                        .on(t.profileId, t.topicId, t.createdAt),
  bySession: index("evidence_session_idx").on(t.sessionId),
}));

/* ---------- 5. learning sessions ---------- */
export const learningSession = pgTable("learning_session", {
  id:        uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id").notNull()
               .references(() => profile.id, { onDelete: "cascade" }),
  kind:      sessionKindEnum("kind").notNull().default("daily"),
  status:    sessionStatusEnum("status").notNull().default("active"),
  planJson:  jsonb("plan_json").$type<SessionPlan>(), // snapshot of composed plan (resume/analytics)
  xpEarned:  integer("xp_earned").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt:   timestamp("ended_at", { withTimezone: true }),
}, (t) => ({
  byProfileTime: index("session_profile_time_idx").on(t.profileId, t.startedAt),
}));
```

```ts
/* ---------- 6. XP ledger ---------- */
// Append-only. Total XP = SUM(amount). Level derived from total XP (pure function).
export const xpEvent = pgTable("xp_event", {
  id:        uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id").notNull()
               .references(() => profile.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id")
               .references(() => learningSession.id, { onDelete: "set null" }),
  topicId:   text("topic_id"),
  reason:    xpReasonEnum("reason").notNull(),
  amount:    integer("amount").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byProfileTime: index("xp_profile_time_idx").on(t.profileId, t.createdAt),
}));

/* ---------- 7. daily activity (streak + daily-goal ledger) ---------- */
// One row per profile per LOCAL date. Streak fields on `profile` are the fast cache;
// this table is the source of truth for the streak/goal calendar + recomputation.
export const dailyActivity = pgTable("daily_activity", {
  id:        uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id").notNull()
               .references(() => profile.id, { onDelete: "cascade" }),
  activityDate: date("activity_date").notNull(), // local date in profile.timezone
  xpEarned:  integer("xp_earned").notNull().default(0),
  goalXp:    integer("goal_xp").notNull(),        // snapshot of that day's goal
  goalMet:   boolean("goal_met").notNull().default(false),
}, (t) => ({
  uniqProfileDate: uniqueIndex("daily_profile_date_uniq").on(t.profileId, t.activityDate),
}));

/* ---------- 8. spaced-repetition review queue ---------- */
// One row per (profile, topic) currently in review rotation (i.e., mastered at least once).
export const reviewQueue = pgTable("review_queue", {
  id:        uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id").notNull()
               .references(() => profile.id, { onDelete: "cascade" }),
  topicId:   text("topic_id").notNull(),
  intervalRung: integer("interval_rung").notNull().default(0), // index into INTERVAL_LADDER
  dueOn:     date("due_on").notNull(),          // local date the review becomes due
  lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
  lapses:    integer("lapses").notNull().default(0),
  suspended: boolean("suspended").notNull().default(false), // true while re-learning (demoted)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqProfileTopic: uniqueIndex("review_profile_topic_uniq").on(t.profileId, t.topicId),
  byProfileDue:     index("review_profile_due_idx").on(t.profileId, t.dueOn),
}));
```

**Why these tables and not more:** enrollment, mastery, evidence, session, xp, daily_activity,
review_queue, profile = 8 tables cover the full loop. No `topic`, `path`, `lesson`,
`exercise`, `badge`, `level` tables — those are content (JSON/taxonomy) or M2 (badges get a
placeholder only when needed). No `sessionActivity` join table: an activity's *outcome* is an
evidence_record (which carries sessionId); the *plan* is `session.planJson`. That avoids a
mutable child table whose truth would drift from the evidence ledger.

**Index rationale:** the two hot reads are (a) composer: "mastery rows for profile by status"
and "reviews due for profile" -> `mastery_profile_status_idx`, `review_profile_due_idx`;
(b) state-machine recompute: "recent evidence for (profile,topic)" -> the
`(profile,topic,createdAt)` composite. Uniques guard the one-row-per-(profile,topic)
invariants and let the app UPSERT on conflict.

## 2. Mastery state machine (`packages/taxonomy` or `packages/db/logic`)

Pure, incremental fold. `applyEvidence` takes the *current* cached state and the *new*
evidence batch (usually 1 record, or the N graded answers of one assessment) and returns the
next state. It never re-scans full history — the counters on `MasteryState` carry the memory.
This keeps it O(batch) and trivially unit-testable (PGlite not required).

```ts
export type MasteryStatus = "unknown" | "inProgress" | "mastered" | "needsReview";

export interface MasteryState {          // maps 1:1 to a masteryState row (+ topicId/profileId)
  status: MasteryStatus;
  consecutiveCorrectAtLevel: number;
  totalCorrect: number;
  totalAttempts: number;
  lapses: number;
  masteredAt: Date | null;
  lastEvidenceAt: Date | null;
}

export interface EvidenceRecord {        // subset of the DB row the machine actually reads
  source: "diagnostic" | "lesson" | "exercise" | "assessment" | "review";
  isCorrect: boolean;
  difficulty: number;                    // 1..5
  createdAt: Date;
}

export interface MasteryConfig {
  targetDifficulty: number;              // per-topic; default 3 (grade level). From topic JSON.
  masteryStreak: number;                 // default 2
  diagnosticStreak: number;              // default 1 (test-out)
  demoteToInProgressLapses: number;      // default 2
}
const DEFAULT_CFG: MasteryConfig =
  { targetDifficulty: 3, masteryStreak: 2, diagnosticStreak: 1, demoteToInProgressLapses: 2 };

export function applyEvidence(
  current: MasteryState,
  evidence: EvidenceRecord[],
  cfg: MasteryConfig = DEFAULT_CFG,
): MasteryState {
  let s = { ...current };
  for (const e of evidence) s = foldOne(s, e, cfg); // ordered by createdAt asc
  return s;
}

function foldOne(s: MasteryState, e: EvidenceRecord, cfg: MasteryConfig): MasteryState {
  const atLevel = e.difficulty >= cfg.targetDifficulty;
  const next: MasteryState = {
    ...s,
    totalAttempts: s.totalAttempts + 1,
    totalCorrect:  s.totalCorrect + (e.isCorrect ? 1 : 0),
    lastEvidenceAt: e.createdAt,
    // streak: +1 only on an at-level correct; ANY incorrect resets; below-level correct = neutral
    consecutiveCorrectAtLevel: e.isCorrect
      ? (atLevel ? s.consecutiveCorrectAtLevel + 1 : s.consecutiveCorrectAtLevel)
      : 0,
  };

  const required =
    e.source === "diagnostic" ? cfg.diagnosticStreak : cfg.masteryStreak;

  switch (s.status) {
    case "unknown":
    case "inProgress": {
      if (next.consecutiveCorrectAtLevel >= required) {
        return { ...next, status: "mastered", masteredAt: e.createdAt };
      }
      return { ...next, status: "inProgress" }; // first touch leaves unknown -> inProgress
    }
    case "mastered": {
      if (e.isCorrect) return next;              // stays mastered (review/exercise pass)
      // any miss on a mastered topic -> needsReview; rebuild confidence from scratch
      return { ...next, status: "needsReview",
               consecutiveCorrectAtLevel: 0, lapses: s.lapses + 1 };
    }
    case "needsReview": {
      if (next.consecutiveCorrectAtLevel >= cfg.masteryStreak) {
        return { ...next, status: "mastered", masteredAt: e.createdAt };
      }
      // repeated failure while re-learning -> drop to inProgress (force a full reteach)
      if (!e.isCorrect && next.lapses >= cfg.demoteToInProgressLapses) {
        return { ...next, status: "inProgress" };
      }
      return next; // stays needsReview
    }
  }
}
```

**Transition table (M1):**

| From | Trigger | To |
|---|---|---|
| unknown/inProgress | at-level correct streak >= 2 (learning) | mastered |
| unknown/inProgress | at-level correct streak >= 1 AND source=diagnostic | mastered (test-out) |
| unknown | any first evidence below threshold | inProgress |
| inProgress | incorrect | inProgress (streak reset to 0) |
| mastered | correct (review/exercise) | mastered (unchanged) |
| mastered | any incorrect | needsReview (streak=0, lapses++) |
| needsReview | at-level correct streak >= 2 | mastered |
| needsReview | incorrect AND lapses >= 2 | inProgress (force reteach) |

**Threshold justification (M1, deliberately simple, safe-by-review):**
- `masteryStreak = 2` at-level correct. Rationale: for a 13-year-old in recovery, demanding
  a long streak burns patience and morale; a short streak risks a lucky guess. Two consecutive
  *at grade-level* correct answers, combined with the spaced-review net that re-tests within
  1-3 days, is the cheapest bar that self-corrects. False positives are caught by the first
  review, not carried indefinitely.
- `diagnosticStreak = 1` (test-out). During the diagnostic we optimize for *not re-teaching
  what the kid knows*; a single at-level correct grants provisional mastery and the topic is
  scheduled for a rung-0 review (1 day) which confirms it. This is what keeps the diagnostic
  short. Risk: a 1/4 lucky MC guess grants a false test-out — mitigated by (a) preferring
  free-form/numeric-entry probes for high-`centrality` topics, (b) the 1-day confirm review.
- `at-level = difficulty >= targetDifficulty (default 3/5)`. Below-level correct answers build
  `inProgress` momentum but never grant mastery; below-level *incorrect* still resets the
  streak (a wrong easy answer is a real signal). `targetDifficulty` comes from topic JSON so
  centrality/age can tune it later without code change.
- `demoteToInProgressLapses = 2`. One forgotten review is normal (stays needsReview, quick
  re-test). Two failures while re-learning means the skill genuinely decayed -> full reteach.

**Design note — mastered->needsReview also fires from routing, not only scheduled reviews.**
When a *dependent* topic's assessment fails and the failure is attributed to a mastered
prerequisite (the Pythagoras->radici case), `routeNext` writes a *derived* evidence_record
(`derived=true`, isCorrect=false, source=assessment) for the prerequisite and runs it through
`applyEvidence`. Thus every state change — even inferred ones — is evidence-backed and
auditable, and the demotion logic lives in exactly one place.

## 3. Adaptive diagnostic algorithm (`packages/taxonomy/diagnostic.ts`)

**Goal:** find the student's *mastery frontier* over the path's target topics + their
hard-prerequisite closure, in <= ~20 questions (soft cap 20, hard cap 25), by exploiting the
monotonicity of mastery along hard edges.

**Core idea (why it is efficient):** mastery is treated as downward-closed over hard-prereq
edges. A PASS high in the graph *prunes an entire subtree* (assume its hard prerequisites are
mastered — "soft-pass"). A FAIL *localizes* the gap downward (descend to hard prerequisites).
Testing the most-advanced topics first (highest topological level) maximizes information per
question: on a pass you eliminate the most, and the first questions naturally spread across all
8 clusters before descending into the failed ones.

**Data model:**

```ts
type ProbeLabel =
  | "untested"
  | "mastered"           // directly PASSED a probe
  | "assumedMastered"    // inferred: an ancestor (dependent) PASSED -> its hard prereqs assumed
  | "unmastered"         // directly FAILED a probe
  | "assumedUnmastered"; // inferred: below a FAIL but not reached before budget ran out

export interface DiagnosticState {
  profileId: string;
  pathId: string;
  targetTopicIds: string[];               // path targets (most advanced)
  scopeTopicIds: string[];                // targets + hard-prereq closure (the whole search space)
  labels: Record<string, ProbeLabel>;     // default "untested"
  worklist: string[];                     // topicIds to consider; kept as max-heap by topoLevel
  asked: number;
  softCap: number;                        // default 20
  hardCap: number;                        // default 25
  currentTopicId: string | null;          // the topic whose answer we are awaiting
  askedTopicIds: string[];                // audit / determinism trace
}

export interface GradedAnswer { topicId: string; passed: boolean; }

export type DiagnosticStep =
  | { kind: "ask"; topicId: string; difficulty: number }
  | { kind: "done"; result: DiagnosticResult };

export interface DiagnosticResult {
  frontier: string[];                     // ready-to-learn now (all hard prereqs met, self not mastered)
  mastered: string[];                     // directly passed
  assumedMastered: string[];              // pruned by an ancestor pass (schedule early confirm review)
  unmastered: string[];                   // to be taught, foundation-first
}
```

**Signature & justification:** `runDiagnosticStep(state, answer)` is a *reducer* rather than a
loop that owns the UI: the caller renders one question, collects the graded answer, and calls
back. This fits the AG-UI streaming model (one question at a time), is resumable (state is
serializable to `session.planJson`), and is deterministic given the graph + answers. This
shape is better than an all-at-once `runDiagnostic()` because a 13-year-old answers
interactively and may quit mid-way — we must persist partial state.

**Algorithm (pseudocode, deterministic):**

```
init(state):
  scope        = targets ∪ hardPrereqClosure(targets)      # whole search space
  labels[*]    = "untested"
  worklist     = maxHeapByTopoLevel(targets)               # start at the most advanced topics
  asked        = 0; currentTopicId = null
  # topoLevel(t) = longest hard-edge path from a source to t; ties broken by topicId (stable)

runDiagnosticStep(state, answer):
  # 1) fold the previous answer, if any
  if answer != null:
     assert answer.topicId == state.currentTopicId
     state.asked += 1
     if answer.passed:
         labels[t] = "mastered"
         for a in hardPrereqClosure(t):                    # a = things t depends on
             if labels[a] == "untested":
                 labels[a] = "assumedMastered"             # PRUNE: skip these questions
                 heapRemove(worklist, a)
         # (direct measurements are never overwritten by inference)
     else:
         labels[t] = "unmastered"
         if state.asked < state.softCap:                   # stop descending once soft cap hit
             for p in directHardPrereqs(t):
                 if labels[p] == "untested" and p not in worklist:
                     heapPush(worklist, p)                  # DESCEND toward the gap
     state.currentTopicId = null

  # 2) pick the next question: highest topoLevel still-uncertain topic
  while worklist not empty:
     t = heapPop(worklist)
     if labels[t] != "untested": continue                  # pruned/decided since enqueued
     if state.asked >= state.hardCap: break                # budget exhausted
     state.currentTopicId = t
     state.askedTopicIds.push(t)
     return { kind: "ask", topicId: t, difficulty: targetDifficulty(t) }

  # 3) no more questions -> finalize
  return { kind: "done", result: finalize(state) }

finalize(state):
  # anything untested that sits below a fail and never got reached = assumed unmastered (teach it)
  for t in scope where labels[t] == "untested":
     labels[t] = allHardPrereqsIn(t, {mastered, assumedMastered}) ? "untested*" : "assumedUnmastered"
     # untested* with all-prereqs-met but never asked (rare, budget) -> treat as frontier candidate
  frontier = { t in scope :
                 labels[t] ∈ {unmastered, assumedUnmastered, untested*}
                 AND every hard prereq of t ∈ {mastered, assumedMastered} }
  return {
    frontier,
    mastered:        [t : labels[t]=="mastered"],
    assumedMastered: [t : labels[t]=="assumedMastered"],
    unmastered:      [t : labels[t] ∈ {unmastered, assumedUnmastered}],
  }
```

**Conflict rule:** direct evidence beats inference. If a prereq was directly FAILED earlier and
a dependent later PASSES, the prereq stays `unmastered` (propagation only overwrites
`untested`). This models a real student who can sometimes get a dependent right despite a shaky
foundation; we keep the measured gap.

**Persisting results:** on `done`, write `mastered`+`assumedMastered` as `mastery_state`
rows with status `mastered` (assumed ones get `derived`-tagged evidence + a rung-0 review due
tomorrow so the assumption is confirmed cheaply); `unmastered` topics get `mastery_state`
status `unknown`/`inProgress` (they enter the teach queue); `frontier` seeds the first
`composeSession`. Set `enrollment.diagnosticSessionId`.

**Question-budget sanity check (M1, 8 clusters, ~40-60 micro-topics):** the first ~8 questions
hit each cluster top (breadth, because ordering is by topoLevel and cluster tops share the top
band); passed clusters vanish. A typical recovery student fails ~4 clusters, each descending
2-3 levels before hitting mastered foundations => 8 + ~10 = ~18 questions. Worst case (fails
everything, deep chains) is bounded by `hardCap=25`; the remainder is marked
`assumedUnmastered` and simply taught bottom-up — we do not need to prove every gap.

**Optional optimization (note, not required for M1):** within a long, unbranched hard-prereq
chain beneath a failed topic, jump to the chain midpoint instead of the immediate parent to get
O(log n) instead of O(n) descent. Not needed at M1's shallow depths; add only if a future path
has chains longer than ~6.

## 4. Session composer + routing + spaced repetition

### 4a. Spaced-repetition scheme (M1)

```ts
export const INTERVAL_LADDER_DAYS = [1, 3, 7, 14, 30, 60]; // rung 0..5 (60 = cap)
```

- **Enter queue** when a topic first reaches `mastered`: create `review_queue` row, rung 0,
  `dueOn = today + 1`.
- **Review pass:** `rung = min(rung+1, 5)`; `dueOn = today + LADDER[rung]`; `lastReviewedAt = now`;
  status stays `mastered`.
- **Review fail:** `lapses++`; `rung = max(0, rung-1)` (drop one rung — confirmed as the M1
  scheme); `dueOn = today` (surface immediately as remediation, not tomorrow); status ->
  `needsReview`. If `lapses >= 2` -> `rung = 0`, `suspended = true`, status -> `inProgress`
  (pulled from rotation until a full reteach re-masters it).
- **What resets intervals:** only a *failed* review, or a demotion routed from a dependent
  topic's failure (same code path via a derived evidence record). Overdue-but-unanswered
  reviews are *not* penalized — they just become due; the composer surfaces most-overdue first.
- **Confirmation of the suggested ladder:** the requested 1/3/7/14/30 ladder + drop-a-rung is
  adopted, extended with a 60-day cap and the double-lapse->reteach demotion. Rationale: fixed
  multipliers are trivially testable and predictable for a parent-facing dashboard; true
  SM-2/FSRS spacing is deferred to M2 where more data exists.

### 4b. `composeSession(profileId): SessionPlan`

```ts
export interface SessionPlan {
  profileId: string;
  sessionKind: "daily" | "diagnostic";
  items: SessionItem[];
  estimatedXp: number;
  dailyXpGoal: number;
}
export type SessionItem =
  | { kind: "review";     topicId: string; reason: "due" | "remediation"; difficulty: number }
  | { kind: "lesson";     topicId: string }                    // explanation + curated video
  | { kind: "exercise";   topicId: string; difficulty: number }
  | { kind: "assessment"; topicId: string; difficulty: number }; // the mastery gate
```

**Quotas / constants (M1):** `MAX_DUE_REVIEWS = 6`, `NEW_TOPICS_PER_SESSION = 1` (2 only if
zero due reviews), `EX_PER_NEW_TOPIC = 3` (escalating difficulty), `EX_PER_REVIEW = 2`,
session hard cap = 12 items or 60 XP (whichever first) to prevent marathons.

```
composeSession(profileId):
  p       = load profile (dailyXpGoal, locale, timezone)
  enr     = active enrollment; graph = taxonomy(enr.pathId); M = masteryMap(profileId)
  today   = localDate(now, p.timezone)

  # tier 1: REMEDIATION — needsReview topics that BLOCK a current frontier topic (fix foundations first)
  remediation = M.filter(status == "needsReview")
                 .filter(t => isHardPrereqOfSomeFrontierTopic(t, graph, M))
                 .sortBy(topoLevel asc, centrality desc)         # deepest, most central first

  # tier 2: DUE REVIEWS (spaced repetition), most overdue first, capped
  dueReviews = reviewQueue(profileId).where(dueOn <= today, !suspended)
                 .sortBy(dueOn asc, centrality desc).take(MAX_DUE_REVIEWS)

  # tier 3: FRONTIER new content — unknown/inProgress whose hard prereqs are all mastered
  frontier = graph.frontier(M)   # {t: status in (unknown,inProgress) & hardPrereqsMastered(t)}
                 .filter(not blockedByRemediation)
                 .sortBy(inProgress-before-unknown, topoLevel asc, centrality desc)
  newTopics = frontier.take(dueReviews.empty && remediation.empty ? 2 : NEW_TOPICS_PER_SESSION)

  # assemble (order tuned for engagement + pedagogy):
  items = []
  for t in remediation:        items += reviewBlock(t, reason="remediation")   # lesson+ex+assess if demoted
  items += dueReviews.take(2).map(warmupReview)                                # short retrieval warm-up
  for t in newTopics:          items += newTopicBlock(t)                       # lesson, 3 ex, assessment
  items += dueReviews.drop(2).map(review)                                      # rest of reviews
  trim items to hard cap; estimatedXp = sum(xpOf(item))
  return { profileId, sessionKind:"daily", items, estimatedXp, dailyXpGoal: p.dailyXpGoal }
```

`reviewBlock`: if the needsReview topic was demoted to `inProgress` (double lapse) it gets a
full `lesson + 3 exercises + assessment`; otherwise `2 exercises + 1 assessment` at rung
difficulty. `newTopicBlock` = `lesson + 3 escalating exercises + assessment`.

### 4c. `routeNext(topicId, outcome, graph, masteryMap): RouteDecision`

Called after a topic *assessment*. `outcome` carries pass/fail plus the concepts the Assessor
attributed to wrong answers (from `evidence_record.attributedConcepts`), which map to prereq
topic IDs.

```ts
export interface AssessmentOutcome {
  passed: boolean;                 // did applyEvidence move it to (or keep it) mastered?
  masteryAfter: MasteryStatus;     // status after applyEvidence ran on this assessment
  failedConcepts: string[];        // attributed prereq/concept topicIds from wrong answers
}
export type RouteDecision =
  | { action: "advance";   masteredTopicId: string; nextTopicId: string | null;
      scheduledReview: { topicId: string; rung: 0; dueOn: string } }
  | { action: "continue";  topicId: string }                 // passed some, not yet mastered
  | { action: "reteach";   topicId: string; demotedTo: "inProgress" } // gap is IN the topic
  | { action: "remediate"; blockedTopicId: string; remediationTopicId: string;
      demotedPrereq?: { topicId: string; to: "needsReview" | "inProgress" } };

routeNext(topicId, outcome, graph, M):
  if outcome.masteryAfter == "mastered":
     next = graph.frontier(M ∪ {topicId:mastered})
              .filter(hardPrereqsMastered).sortBy(topoLevel asc, centrality desc).first()
     return { action:"advance", masteredTopicId: topicId, nextTopicId: next?.id ?? null,
              scheduledReview: { topicId, rung:0, dueOn: today+1 } }   # enter review queue

  if outcome.passed-partially (some correct, no fail attributable to a prereq):
     return { action:"continue", topicId }                 # just needs more practice

  # FAIL with attributable gap -> find the true root cause below
  hardPrereqs = graph.directHardPrereqs(topicId)
  weak = hardPrereqs.filter(p =>
             M[p].status != "mastered" || outcome.failedConcepts.includes(p))
  if weak.isEmpty:
     return { action:"reteach", topicId, demotedTo:"inProgress" }  # foundations fine; topic itself is the gap

  target = deepestUnmetHardPrereq(argminTopoLevel(weak), M, graph)  # descend to the root cause
  demote = M[target].status == "mastered"                          # was falsely mastered?
  return { action:"remediate", blockedTopicId: topicId, remediationTopicId: target,
           demotedPrereq: demote ? { topicId: target,
             to: M[target].lapses+1 >= 2 ? "inProgress" : "needsReview" } : undefined }

deepestUnmetHardPrereq(t, M, graph):
  while ∃ p in graph.directHardPrereqs(t) where M[p].status != "mastered":
     t = argminTopoLevel(such p)        # keep descending toward the foundation
  return t
```

The caller applies the decision: `remediate` writes the derived fail-evidence for
`remediationTopicId` (-> `applyEvidence` demotes it), updates its `review_queue` (lapses++,
rung--, dueOn=today), and leaves `blockedTopicId` as `inProgress` (it will not appear on the
frontier until the prereq is re-mastered). `advance` upserts the `review_queue` row rung 0.

**Why pick the deepest weakest prereq, not the first:** remediating a mid-level topic that is
itself broken wastes a session. Descending to the true root (`deepestUnmetHardPrereq`) fixes
the foundation once; the intermediate topics then fall out naturally on the way back up.
*Runner-up that would win instead:* if the Assessor's `failedConcepts` attribution is
high-confidence and points at exactly one prereq, route straight to it (skip the descent) —
cheaper and more precise. Use attribution when present; fall back to the graph descent when the
grader can't localize.

## 5. Verification walkthrough — fails "Teorema di Pitagora" because "radici" is weak

**Topic chain (math-it-media extension; hard edges, per professor's plan):**
`mt_pitagora` --hard--> `mt_radici_quad` --hard--> `mt_potenze_quad` (squares).
All `targetDifficulty = 3`. Profile `P`, owner (parent) `U`.

**State BEFORE the assessment** (post-diagnostic; radici was a false test-out — passed 1
lucky diagnostic MC):

| table | row | key fields |
|---|---|---|
| mastery_state | potenze_quad | status=mastered, streak=2, masteredAt set |
| mastery_state | radici_quad  | status=mastered (from diagnostic, streak=1), lapses=0 |
| mastery_state | pitagora     | status=inProgress, streak=0 (lesson done, taking assessment) |
| review_queue  | radici_quad  | rung 0, dueOn=today+1 (the confirm review) |
| review_queue  | potenze_quad | rung 1, dueOn=today+3 |

**Assessment on `mt_pitagora`** — 4 questions at difficulty 3. Student sets up the triangle
correctly (2 correct) but cannot compute the square root (√(9+16)=√25 -> answers "25" twice).
Assessor grades and tags the two wrong answers `attributedConcepts=["mt_radici_quad"]`.

1. **Evidence ledger** — 4 immutable `evidence_record` rows inserted (topicId=mt_pitagora,
   source=assessment, difficulty=3): 2× isCorrect=true, 2× isCorrect=false, the two failures
   carrying `attributedConcepts=["mt_radici_quad"]`, plus `rubricNotes` error analysis.

2. **`applyEvidence(inProgress pitagora, [4 records])`** — batch contains incorrects ->
   `consecutiveCorrectAtLevel` resets to 0; `totalAttempts += 4`, `totalCorrect += 2`; status
   stays `inProgress`. `masteryAfter = inProgress`, `passed = false`.
   - Row change: mastery_state.pitagora -> streak 0, totalAttempts 4, totalCorrect 2 (still inProgress).

3. **`routeNext("mt_pitagora", {passed:false, masteryAfter:inProgress,
   failedConcepts:["mt_radici_quad"]}, graph, M)`:**
   - hardPrereqs(pitagora) = [radici_quad, potenze_quad].
   - weak = prereqs not-mastered OR in failedConcepts = [radici_quad] (mastered but *implicated*).
   - `deepestUnmetHardPrereq(radici_quad)`: its hard prereq potenze_quad is mastered & not
     implicated -> radici_quad is the root. target = radici_quad.
   - radici_quad was mastered -> `demote`. lapses+1 = 1 (< 2) -> `to = "needsReview"`.
   - **Returns:** `{ action:"remediate", blockedTopicId:"mt_pitagora",
     remediationTopicId:"mt_radici_quad", demotedPrereq:{ topicId:"mt_radici_quad",
     to:"needsReview" } }`.

4. **Caller applies the decision — rows that change:**
   - `evidence_record`: 1 *derived* row inserted (topicId=mt_radici_quad, source=assessment,
     isCorrect=false, difficulty=3, derived=true, promptRef=the pitagora item) — makes the
     demotion evidence-backed.
   - `applyEvidence(mastered radici_quad, [derived fail])`: mastered + incorrect ->
     status=`needsReview`, streak=0, lapses 0->1.
     Row change: mastery_state.radici_quad -> status=needsReview, lapses=1.
   - `review_queue.radici_quad`: lapses 0->1, rung max(0,0-1)=0, dueOn=today, status-driver
     needsReview -> surfaces immediately as remediation.
   - mastery_state.pitagora: unchanged (inProgress); now *blocked* because a hard prereq is
     needsReview -> it will NOT appear on the frontier.
   - `xp_event`: rows for the 2 correct answers (exerciseCorrect); session xpEarned updated;
     `daily_activity` + profile streak updated at session end (goal progress).

**NEXT `composeSession(P)` produces:**
- Tier 1 remediation: `mt_radici_quad` (needsReview, blocks pitagora) — highest priority.
  Not double-lapsed, so reviewBlock = short: but because the earlier "mastery" was a false
  test-out (streak was 1, never truly learned) the composer offers a fresh `lesson` +
  3 escalating `exercise`s + `assessment` (alternative video explanation of square roots).
- Tier 2 due reviews: `mt_potenze_quad` if due (warm-up, 2 exercises at rung-1 difficulty).
- Tier 3 frontier: `mt_pitagora` is **excluded** (blocked prereq). If an independent path
  topic exists (e.g. `mt_piano_cartesiano`) it may fill remaining budget; otherwise the
  session is remediation-focused.

Resulting SessionPlan.items (ordered): `[review(radici,remediation,d2), lesson(radici),
exercise(radici,d2), exercise(radici,d3), exercise(radici,d3), assessment(radici,d3),
review(potenze_quad,due,d3) ×2]`.

**Closing the loop:** when the student answers the radici assessment with 2 consecutive
at-level correct -> `applyEvidence` moves radici_quad `needsReview -> mastered`;
`routeNext(radici_quad, pass)` -> `advance`, re-enters review_queue rung 0 due+1; pitagora's
prereqs are now all mastered, so pitagora returns to the frontier and the *following* session
offers a pitagora reteach/continue. The false test-out has been detected and repaired by the
routing + review machinery — exactly the self-correction the low mastery threshold relies on.

## 6. Red-team — where this design can break, and the guard

- **Lucky-guess false mastery (streak=2, diagnostic=1).** The whole model leans on spaced
  review + dependent-failure routing to catch false positives. This is *sound only if reviews
  actually happen*. If a kid does the diagnostic then stops, false test-outs are never
  confirmed. Guard: schedule assumed/test-out masteries at rung 0 (1 day) and treat the parent
  dashboard's "confirm reviews pending" as a nudge. Residual risk accepted for M1.
- **Assessor attribution quality drives routing precision.** `routeNext` prefers
  `failedConcepts`; if the mid-tier grading model tags the wrong prereq, we remediate the wrong
  topic. Guard: the graph-descent fallback (`deepestUnmetHardPrereq`) is used whenever
  attribution is empty/low-confidence, so routing degrades to "fix the deepest unmet prereq"
  rather than misfiring. Eval fixtures (spec §7) must include attribution cases.
- **Diagnostic worst case > 25 questions if the graph is deep and the kid fails everything.**
  Bounded by `hardCap`; the untested remainder is marked `assumedUnmastered` and taught
  bottom-up. Correct behavior, but the frontier on day 1 will be the graph's foundational
  layer — verify math-it-media's lowest topics are genuinely elementary so this isn't
  demoralizing.
- **`mastered -> needsReview` on ANY single miss may be too twitchy.** A careless slip on an
  otherwise-solid topic demotes it. Guard: it only costs one quick re-test (needsReview requires
  2 to restore, but a solid kid clears that fast) and one review rung. If churn shows up in M1
  data, gate demotion on 2 misses within a window — a one-line change to `foldOne`.
- **Streak/timezone correctness.** `daily_activity` keys on the *local* date via
  `profile.timezone`; computing "today" server-side in UTC would break streaks around midnight
  CET. The schema carries `timezone` precisely to avoid this; the cron review job must also
  bucket by local date.
- **Multi-tenant leak risk is in application code, not schema.** The schema enables isolation
  (owner scoping) but does not enforce it — a query that forgets `WHERE ownerUserId = ?` leaks
  across parents. Guard: a repository layer that injects the scope, plus (recommended) Postgres
  RLS in M2. This is the single highest-cost-of-error item and must be covered by tests.

## 7. Open decisions deferred to implementation (labeled — not yet verified against code)

These are inferences from the spec, not from existing code (the repo is docs-only today):
- The exact `mt_XXXX` IDs and `targetDifficulty` per topic depend on authoring math-it-media;
  the scenario IDs above are illustrative.
- Better Auth's generated table/column names (`user.id` as `text`) are the documented defaults;
  confirm against the actual generated `auth-schema.ts` once Better Auth is wired.
- XP amounts per activity are placeholders (goal default 30); tune with real session data.
