import {
  pgTable, pgEnum, uuid, text, integer, boolean, numeric,
  timestamp, date, jsonb, index, uniqueIndex
} from "drizzle-orm/pg-core";
import type { SessionPlan } from "@lyceora/engine";
import { user } from "./auth-schema";

export const localeEnum = pgEnum("locale", ["it", "en"]);
export const masteryStatusEnum = pgEnum("mastery_status", ["unknown", "inProgress", "mastered", "needsReview"]);
export const evidenceSourceEnum = pgEnum("evidence_source", ["diagnostic", "lesson", "exercise", "assessment", "review"]);
export const sessionKindEnum = pgEnum("session_kind", ["diagnostic", "daily"]);
export const sessionStatusEnum = pgEnum("session_status", ["active", "completed", "abandoned"]);
export const enrollmentStatusEnum = pgEnum("enrollment_status", ["active", "completed", "paused"]);
export const xpReasonEnum = pgEnum("xp_reason", [
  "lessonComplete", "exerciseCorrect", "assessmentPass",
  "reviewComplete", "diagnosticComplete", "streakBonus", "goalBonus"
]);

/** Child profile. TENANT ROOT: ownerUserId (parent). Child data = first name + birth year only. */
export const profile = pgTable("profile", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: text("owner_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  birthYear: integer("birth_year"),
  locale: localeEnum("locale").notNull().default("it"),
  timezone: text("timezone").notNull().default("Europe/Rome"),
  dailyXpGoal: integer("daily_xp_goal").notNull().default(30),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastActiveOn: date("last_active_on"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date())
}, (t) => [index("profile_owner_idx").on(t.ownerUserId)]);

/** Pointer from a profile to a JSON-defined learning path. */
export const enrollment = pgTable("enrollment", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id").notNull().references(() => profile.id, { onDelete: "cascade" }),
  pathId: text("path_id").notNull(),
  status: enrollmentStatusEnum("status").notNull().default("active"),
  diagnosticSessionId: uuid("diagnostic_session_id"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex("enrollment_profile_path_uniq").on(t.profileId, t.pathId)]);

/** Cached projection of the evidence ledger + rolling counters. Rebuildable. */
export const masteryState = pgTable("mastery_state", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id").notNull().references(() => profile.id, { onDelete: "cascade" }),
  topicId: text("topic_id").notNull(),
  status: masteryStatusEnum("status").notNull().default("unknown"),
  consecutiveCorrectAtLevel: integer("consecutive_correct_at_level").notNull().default(0),
  totalCorrect: integer("total_correct").notNull().default(0),
  totalAttempts: integer("total_attempts").notNull().default(0),
  lapses: integer("lapses").notNull().default(0),
  masteredAt: timestamp("mastered_at", { withTimezone: true }),
  lastEvidenceAt: timestamp("last_evidence_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date())
}, (t) => [
  uniqueIndex("mastery_profile_topic_uniq").on(t.profileId, t.topicId),
  index("mastery_profile_status_idx").on(t.profileId, t.status)
]);

/** Append-only. One row per graded item. derived=true marks routing-inferred records. */
export const evidenceRecord = pgTable("evidence_record", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id").notNull().references(() => profile.id, { onDelete: "cascade" }),
  topicId: text("topic_id").notNull(),
  sessionId: uuid("session_id").references(() => learningSession.id, { onDelete: "set null" }),
  source: evidenceSourceEnum("source").notNull(),
  isCorrect: boolean("is_correct").notNull(),
  difficulty: integer("difficulty").notNull(), // 1..3
  score: numeric("score", { precision: 4, scale: 3 }),
  promptRef: text("prompt_ref"),
  question: text("question"),
  studentAnswer: text("student_answer"),
  rubricNotes: text("rubric_notes"),
  attributedConcepts: jsonb("attributed_concepts").$type<string[]>(),
  derived: boolean("derived").notNull().default(false),
  responseMs: integer("response_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [
  index("evidence_profile_topic_time_idx").on(t.profileId, t.topicId, t.createdAt),
  index("evidence_session_idx").on(t.sessionId)
]);

export const learningSession = pgTable("learning_session", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id").notNull().references(() => profile.id, { onDelete: "cascade" }),
  kind: sessionKindEnum("kind").notNull().default("daily"),
  status: sessionStatusEnum("status").notNull().default("active"),
  planJson: jsonb("plan_json").$type<SessionPlan>(),
  xpEarned: integer("xp_earned").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true })
}, (t) => [index("session_profile_time_idx").on(t.profileId, t.startedAt)]);

/** Append-only XP ledger. Total XP = SUM(amount). */
export const xpEvent = pgTable("xp_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id").notNull().references(() => profile.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").references(() => learningSession.id, { onDelete: "set null" }),
  topicId: text("topic_id"),
  reason: xpReasonEnum("reason").notNull(),
  amount: integer("amount").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("xp_profile_time_idx").on(t.profileId, t.createdAt)]);

/** One row per profile per LOCAL date (profile.timezone). Source of truth for streaks. */
export const dailyActivity = pgTable("daily_activity", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id").notNull().references(() => profile.id, { onDelete: "cascade" }),
  activityDate: date("activity_date").notNull(),
  xpEarned: integer("xp_earned").notNull().default(0),
  goalXp: integer("goal_xp").notNull(),
  goalMet: boolean("goal_met").notNull().default(false)
}, (t) => [uniqueIndex("daily_profile_date_uniq").on(t.profileId, t.activityDate)]);

/** One row per (profile, topic) in spaced-repetition rotation. */
export const reviewQueue = pgTable("review_queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id").notNull().references(() => profile.id, { onDelete: "cascade" }),
  topicId: text("topic_id").notNull(),
  intervalRung: integer("interval_rung").notNull().default(0),
  dueOn: date("due_on").notNull(),
  lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
  lapses: integer("lapses").notNull().default(0),
  suspended: boolean("suspended").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [
  uniqueIndex("review_profile_topic_uniq").on(t.profileId, t.topicId),
  index("review_profile_due_idx").on(t.profileId, t.dueOn)
]);

/**
 * Learning-signal inbox (self-improving-agents capture stage). Snake_case column
 * names mirror learning-signal.schema.json — this is the storage contract the M3
 * distiller reads. DB instead of JSONL because Vercel has no persistent filesystem.
 */
export const learningSignal = pgTable("learning_signal", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id").references(() => profile.id, { onDelete: "cascade" }),
  threadId: text("thread_id").notNull(),
  runId: text("run_id").notNull(),
  actor: text("actor").notNull(),          // "user" | "agent"
  signal: text("signal").notNull(),        // correction | approval | rejection | explicit_teach | tool_result | run_error
  before: text("before"),
  after: text("after"),
  context: text("context"),
  scopeHint: text("scope_hint"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("signal_profile_time_idx").on(t.profileId, t.createdAt)]);
