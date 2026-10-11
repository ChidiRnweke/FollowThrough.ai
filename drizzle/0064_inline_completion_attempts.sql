CREATE TABLE "inline_completion_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"attempted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inline_completion_attempts" ADD CONSTRAINT "inline_completion_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inline_completion_attempts_user_time_idx" ON "inline_completion_attempts" USING btree ("user_id","attempted_at");