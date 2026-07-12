CREATE TABLE "rate_limit_window" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"route" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rate_limit_window" ADD CONSTRAINT "rate_limit_window_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rate_window_uniq" ON "rate_limit_window" USING btree ("profile_id","route","window_start");--> statement-breakpoint
ALTER TABLE "evidence_record" ADD CONSTRAINT "evidence_difficulty_check" CHECK ("evidence_record"."difficulty" BETWEEN 1 AND 3);--> statement-breakpoint
ALTER TABLE "served_exercise" ADD CONSTRAINT "served_exercise_difficulty_check" CHECK ("served_exercise"."difficulty" BETWEEN 1 AND 3);