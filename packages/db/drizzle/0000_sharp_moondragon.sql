CREATE TYPE "public"."enrollment_status" AS ENUM('active', 'completed', 'paused');--> statement-breakpoint
CREATE TYPE "public"."evidence_source" AS ENUM('diagnostic', 'lesson', 'exercise', 'assessment', 'review');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('it', 'en');--> statement-breakpoint
CREATE TYPE "public"."mastery_status" AS ENUM('unknown', 'inProgress', 'mastered', 'needsReview');--> statement-breakpoint
CREATE TYPE "public"."session_kind" AS ENUM('diagnostic', 'daily');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('active', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."xp_reason" AS ENUM('lessonComplete', 'exerciseCorrect', 'assessmentPass', 'reviewComplete', 'diagnosticComplete', 'streakBonus', 'goalBonus');--> statement-breakpoint
CREATE TABLE "daily_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"activity_date" date NOT NULL,
	"xp_earned" integer DEFAULT 0 NOT NULL,
	"goal_xp" integer NOT NULL,
	"goal_met" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"path_id" text NOT NULL,
	"status" "enrollment_status" DEFAULT 'active' NOT NULL,
	"diagnostic_session_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"topic_id" text NOT NULL,
	"session_id" uuid,
	"source" "evidence_source" NOT NULL,
	"is_correct" boolean NOT NULL,
	"difficulty" integer NOT NULL,
	"score" numeric(4, 3),
	"prompt_ref" text,
	"question" text,
	"student_answer" text,
	"rubric_notes" text,
	"attributed_concepts" jsonb,
	"derived" boolean DEFAULT false NOT NULL,
	"response_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"kind" "session_kind" DEFAULT 'daily' NOT NULL,
	"status" "session_status" DEFAULT 'active' NOT NULL,
	"plan_json" jsonb,
	"xp_earned" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "learning_signal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid,
	"thread_id" text NOT NULL,
	"run_id" text NOT NULL,
	"actor" text NOT NULL,
	"signal" text NOT NULL,
	"before" text,
	"after" text,
	"context" text,
	"scope_hint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mastery_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"topic_id" text NOT NULL,
	"status" "mastery_status" DEFAULT 'unknown' NOT NULL,
	"consecutive_correct_at_level" integer DEFAULT 0 NOT NULL,
	"total_correct" integer DEFAULT 0 NOT NULL,
	"total_attempts" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"mastered_at" timestamp with time zone,
	"last_evidence_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"birth_year" integer,
	"locale" "locale" DEFAULT 'it' NOT NULL,
	"timezone" text DEFAULT 'Europe/Rome' NOT NULL,
	"daily_xp_goal" integer DEFAULT 30 NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_active_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"topic_id" text NOT NULL,
	"interval_rung" integer DEFAULT 0 NOT NULL,
	"due_on" date NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"lapses" integer DEFAULT 0 NOT NULL,
	"suspended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xp_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"session_id" uuid,
	"topic_id" text,
	"reason" "xp_reason" NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_activity" ADD CONSTRAINT "daily_activity_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_record" ADD CONSTRAINT "evidence_record_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_record" ADD CONSTRAINT "evidence_record_session_id_learning_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."learning_session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_session" ADD CONSTRAINT "learning_session_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_signal" ADD CONSTRAINT "learning_signal_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mastery_state" ADD CONSTRAINT "mastery_state_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_queue" ADD CONSTRAINT "review_queue_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_event" ADD CONSTRAINT "xp_event_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_event" ADD CONSTRAINT "xp_event_session_id_learning_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."learning_session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_profile_date_uniq" ON "daily_activity" USING btree ("profile_id","activity_date");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollment_profile_path_uniq" ON "enrollment" USING btree ("profile_id","path_id");--> statement-breakpoint
CREATE INDEX "evidence_profile_topic_time_idx" ON "evidence_record" USING btree ("profile_id","topic_id","created_at");--> statement-breakpoint
CREATE INDEX "evidence_session_idx" ON "evidence_record" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "session_profile_time_idx" ON "learning_session" USING btree ("profile_id","started_at");--> statement-breakpoint
CREATE INDEX "signal_profile_time_idx" ON "learning_signal" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mastery_profile_topic_uniq" ON "mastery_state" USING btree ("profile_id","topic_id");--> statement-breakpoint
CREATE INDEX "mastery_profile_status_idx" ON "mastery_state" USING btree ("profile_id","status");--> statement-breakpoint
CREATE INDEX "profile_owner_idx" ON "profile" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_profile_topic_uniq" ON "review_queue" USING btree ("profile_id","topic_id");--> statement-breakpoint
CREATE INDEX "review_profile_due_idx" ON "review_queue" USING btree ("profile_id","due_on");--> statement-breakpoint
CREATE INDEX "xp_profile_time_idx" ON "xp_event" USING btree ("profile_id","created_at");