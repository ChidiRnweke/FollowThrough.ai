ALTER TABLE "agent_runs" ADD COLUMN "input_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "retry_of_run_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "context_project_id" uuid;--> statement-breakpoint
UPDATE "conversations"
SET "context_project_id" = "notes"."project_id"
FROM "notes"
WHERE "conversations"."context_note_id" = "notes"."id";--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_retry_of_run_id_agent_runs_id_fk" FOREIGN KEY ("retry_of_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_context_project_id_projects_id_fk" FOREIGN KEY ("context_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
