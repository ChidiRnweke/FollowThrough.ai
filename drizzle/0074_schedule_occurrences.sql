CREATE TABLE "schedule_occurrences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"schedule_id" uuid,
	"trigger" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"conversation_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"opened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_occurrences_trigger_check" CHECK ("schedule_occurrences"."trigger" in ('recurrence', 'manual'))
);
--> statement-breakpoint
ALTER TABLE "schedule_occurrences" ADD CONSTRAINT "schedule_occurrences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_occurrences" ADD CONSTRAINT "schedule_occurrences_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_occurrences" ADD CONSTRAINT "schedule_occurrences_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_occurrences" ADD CONSTRAINT "schedule_occurrences_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_occurrences_conversation_unique" ON "schedule_occurrences" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_occurrences_run_unique" ON "schedule_occurrences" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_occurrences_recurrence_unique" ON "schedule_occurrences" USING btree ("schedule_id","scheduled_for") WHERE "schedule_occurrences"."trigger" = 'recurrence';--> statement-breakpoint
CREATE INDEX "schedule_occurrences_schedule_idx" ON "schedule_occurrences" USING btree ("schedule_id","scheduled_for");