CREATE TABLE "note_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"title" text NOT NULL,
	"document" jsonb NOT NULL,
	"plain_text" text NOT NULL,
	"provenance_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_revisions_revision_positive" CHECK ("note_revisions"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_created_by_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "diagrams" DROP CONSTRAINT "diagrams_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "entities" DROP CONSTRAINT "entities_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "note_relationships" DROP CONSTRAINT "note_relationships_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "notes" DROP CONSTRAINT "notes_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "notes" DROP CONSTRAINT "notes_created_by_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "provenance" DROP CONSTRAINT "provenance_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "provenance" DROP CONSTRAINT "provenance_actor_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "references" DROP CONSTRAINT "references_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "search_chunks" DROP CONSTRAINT "search_chunks_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "suggestions" DROP CONSTRAINT "suggestions_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "suggestions" DROP CONSTRAINT "suggestions_decided_by_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "todos" DROP CONSTRAINT "todos_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "todos" DROP CONSTRAINT "todos_created_by_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "todos" DROP CONSTRAINT "todos_owner_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "trust_policies" DROP CONSTRAINT "trust_policies_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "trust_policies" DROP CONSTRAINT "trust_policies_updated_by_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "conversations_workspace_updated_idx";--> statement-breakpoint
DROP INDEX "entities_workspace_type_name_unique";--> statement-breakpoint
DROP INDEX "entities_workspace_type_idx";--> statement-breakpoint
DROP INDEX "notes_workspace_updated_idx";--> statement-breakpoint
DROP INDEX "notes_workspace_kind_idx";--> statement-breakpoint
DROP INDEX "provenance_workspace_created_idx";--> statement-breakpoint
DROP INDEX "search_chunks_workspace_idx";--> statement-breakpoint
DROP INDEX "todos_workspace_status_idx";--> statement-breakpoint
DROP INDEX "todos_owner_status_due_idx";--> statement-breakpoint
DROP INDEX "suggestions_inbox_idx";--> statement-breakpoint
DROP INDEX "todos_waiting_due_idx";--> statement-breakpoint
ALTER TABLE "trust_policies" DROP CONSTRAINT "trust_policies_workspace_id_pipeline_pk";--> statement-breakpoint
ALTER TABLE "search_chunks" ALTER COLUMN "embedding" SET DATA TYPE vector(3072);--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "diagrams" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "note_relationships" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "current_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "provenance" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "references" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "search_chunks" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "source_anchors" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "suggestions" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "trust_policies" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "trust_policies" ADD CONSTRAINT "trust_policies_user_id_pipeline_pk" PRIMARY KEY("user_id","pipeline");--> statement-breakpoint
ALTER TABLE "note_revisions" ADD CONSTRAINT "note_revisions_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_revisions" ADD CONSTRAINT "note_revisions_provenance_id_provenance_id_fk" FOREIGN KEY ("provenance_id") REFERENCES "public"."provenance"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "note_revisions_note_revision_unique" ON "note_revisions" USING btree ("note_id","revision");--> statement-breakpoint
CREATE INDEX "note_revisions_note_created_idx" ON "note_revisions" USING btree ("note_id","created_at");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagrams" ADD CONSTRAINT "diagrams_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_relationships" ADD CONSTRAINT "note_relationships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provenance" ADD CONSTRAINT "provenance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "references" ADD CONSTRAINT "references_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_chunks" ADD CONSTRAINT "search_chunks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_policies" ADD CONSTRAINT "trust_policies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_user_updated_idx" ON "conversations" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "entities_user_type_name_unique" ON "entities" USING btree ("user_id","type",lower("name"));--> statement-breakpoint
CREATE INDEX "entities_user_type_idx" ON "entities" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "notes_user_updated_idx" ON "notes" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "notes_user_kind_idx" ON "notes" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "provenance_user_created_idx" ON "provenance" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "search_chunks_user_idx" ON "search_chunks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "todos_user_status_due_idx" ON "todos" USING btree ("user_id","status","due_date");--> statement-breakpoint
CREATE INDEX "suggestions_inbox_idx" ON "suggestions" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "todos_waiting_due_idx" ON "todos" USING btree ("user_id","responsibility","due_date");--> statement-breakpoint
ALTER TABLE "conversations" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "conversations" DROP COLUMN "created_by_id";--> statement-breakpoint
ALTER TABLE "diagrams" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "entities" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "note_relationships" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "notes" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "notes" DROP COLUMN "created_by_id";--> statement-breakpoint
ALTER TABLE "provenance" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "provenance" DROP COLUMN "actor_user_id";--> statement-breakpoint
ALTER TABLE "references" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "search_chunks" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "source_anchors" DROP COLUMN "document_version";--> statement-breakpoint
ALTER TABLE "suggestions" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "suggestions" DROP COLUMN "decided_by_id";--> statement-breakpoint
ALTER TABLE "todos" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "todos" DROP COLUMN "created_by_id";--> statement-breakpoint
ALTER TABLE "todos" DROP COLUMN "owner_id";--> statement-breakpoint
ALTER TABLE "trust_policies" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "trust_policies" DROP COLUMN "updated_by_id";--> statement-breakpoint
ALTER TABLE "workspace_members" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspaces" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "workspace_members" CASCADE;--> statement-breakpoint
DROP TABLE "workspaces" CASCADE;--> statement-breakpoint
DROP TYPE "public"."workspace_role";
