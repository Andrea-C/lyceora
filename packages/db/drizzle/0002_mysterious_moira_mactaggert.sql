CREATE TABLE "served_exercise" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"topic_id" text NOT NULL,
	"difficulty" integer NOT NULL,
	"exercise_json" jsonb NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "served_exercise" ADD CONSTRAINT "served_exercise_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "served_exercise" ADD CONSTRAINT "served_exercise_session_id_learning_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."learning_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "served_exercise_profile_session_idx" ON "served_exercise" USING btree ("profile_id","session_id");