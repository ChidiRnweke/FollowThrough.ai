ALTER TABLE "search_chunks" DROP CONSTRAINT "search_chunks_single_source";--> statement-breakpoint
DROP INDEX "attachments_note_path_unique";--> statement-breakpoint
ALTER TABLE "attachment_uploads" ALTER COLUMN "note_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "note_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attachment_uploads" ADD COLUMN "project_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "attachment_versions" ADD COLUMN "processing_status" text DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE "attachment_versions" ADD COLUMN "processing_failure" text;--> statement-breakpoint
ALTER TABLE "attachment_versions" ADD COLUMN "processed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "project_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "search_chunks" ADD COLUMN "attachment_id" uuid;--> statement-breakpoint
ALTER TABLE "search_chunks" ADD COLUMN "attachment_path" text;--> statement-breakpoint
ALTER TABLE "attachment_uploads" ADD CONSTRAINT "attachment_uploads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_chunks" ADD CONSTRAINT "search_chunks_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_project_path_unique" ON "attachments" USING btree ("project_id","path") WHERE "attachments"."note_id" is null;--> statement-breakpoint
CREATE INDEX "attachments_project_idx" ON "attachments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "search_chunks_attachment_idx" ON "search_chunks" USING btree ("attachment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_note_path_unique" ON "attachments" USING btree ("note_id","path") WHERE "attachments"."note_id" is not null;--> statement-breakpoint
ALTER TABLE "search_chunks" ADD CONSTRAINT "search_chunks_single_source" CHECK (num_nonnulls("search_chunks"."note_id", "search_chunks"."memory_entry_id", "search_chunks"."attachment_id") = 1);