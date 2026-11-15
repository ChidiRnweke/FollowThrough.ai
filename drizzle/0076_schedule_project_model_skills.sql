ALTER TABLE "schedules" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "skill_note_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_model_check" CHECK ("schedules"."model" is null or length(btrim("schedules"."model")) > 0);