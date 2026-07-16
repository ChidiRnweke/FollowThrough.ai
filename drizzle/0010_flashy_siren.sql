ALTER TYPE "public"."pipeline_kind" ADD VALUE 'memory';--> statement-breakpoint
ALTER TYPE "public"."suggestion_kind" ADD VALUE 'memory';--> statement-breakpoint
CREATE TABLE "memory_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"content" text NOT NULL,
	"share_with_agents" boolean DEFAULT true NOT NULL,
	"provenance_id" uuid,
	"replaces_entry_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "search_chunks" ALTER COLUMN "note_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "search_chunks" ADD COLUMN "memory_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "memory_entries" ADD CONSTRAINT "memory_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entries" ADD CONSTRAINT "memory_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entries" ADD CONSTRAINT "memory_entries_provenance_id_provenance_id_fk" FOREIGN KEY ("provenance_id") REFERENCES "public"."provenance"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entries" ADD CONSTRAINT "memory_entries_replaces_entry_id_memory_entries_id_fk" FOREIGN KEY ("replaces_entry_id") REFERENCES "public"."memory_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memory_entries_project_active_idx" ON "memory_entries" USING btree ("project_id","deleted_at","updated_at");--> statement-breakpoint
CREATE INDEX "memory_entries_user_idx" ON "memory_entries" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "search_chunks" ADD CONSTRAINT "search_chunks_memory_entry_id_memory_entries_id_fk" FOREIGN KEY ("memory_entry_id") REFERENCES "public"."memory_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "search_chunks_memory_idx" ON "search_chunks" USING btree ("memory_entry_id");--> statement-breakpoint
ALTER TABLE "search_chunks" ADD CONSTRAINT "search_chunks_single_source" CHECK (("search_chunks"."note_id" is null) <> ("search_chunks"."memory_entry_id" is null));