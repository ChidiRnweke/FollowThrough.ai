CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."diagram_kind" AS ENUM('mermaid', 'drawio');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant', 'tool');--> statement-breakpoint
CREATE TYPE "public"."note_kind" AS ENUM('note', 'skill');--> statement-breakpoint
CREATE TYPE "public"."pipeline_kind" AS ENUM('extract_promises', 'relate', 'reference', 'agent');--> statement-breakpoint
CREATE TYPE "public"."producer_kind" AS ENUM('user', 'pipeline', 'agent');--> statement-breakpoint
CREATE TYPE "public"."promise_strength" AS ENUM('explicit', 'implied', 'tentative');--> statement-breakpoint
CREATE TYPE "public"."reference_tier" AS ENUM('official', 'standard', 'vendor', 'community');--> statement-breakpoint
CREATE TYPE "public"."relationship_kind" AS ENUM('same_client', 'same_system', 'prior_decision', 'contradicts', 'elaborates', 'mentions');--> statement-breakpoint
CREATE TYPE "public"."suggestion_kind" AS ENUM('todo', 'backlink', 'reference', 'content_insertion', 'diagram');--> statement-breakpoint
CREATE TYPE "public"."suggestion_status" AS ENUM('proposed', 'accepted', 'rejected', 'expired', 'reverted');--> statement-breakpoint
CREATE TYPE "public"."todo_responsibility" AS ENUM('mine', 'waiting_on');--> statement-breakpoint
CREATE TYPE "public"."todo_status" AS ENUM('backlog', 'open', 'in_progress', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."workspace_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_id" uuid NOT NULL,
	"context_note_id" uuid,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diagrams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"kind" "diagram_kind" NOT NULL,
	"title" text,
	"source" text NOT NULL,
	"rendered_svg" text,
	"searchable_text" text DEFAULT '' NOT NULL,
	"promoted_from_id" uuid,
	"source_anchor_id" uuid,
	"provenance_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" jsonb NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_entities" (
	"note_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"source_anchor_id" uuid,
	"provenance_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_entities_note_id_entity_id_pk" PRIMARY KEY("note_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "note_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_note_id" uuid NOT NULL,
	"target_note_id" uuid NOT NULL,
	"kind" "relationship_kind" NOT NULL,
	"justification" text,
	"source_anchor_id" uuid,
	"provenance_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_relationships_not_self" CHECK ("note_relationships"."source_note_id" <> "note_relationships"."target_note_id")
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"parent_id" uuid,
	"created_by_id" uuid NOT NULL,
	"kind" "note_kind" DEFAULT 'note' NOT NULL,
	"title" text NOT NULL,
	"document" jsonb DEFAULT '{"type":"doc","content":[]}'::jsonb NOT NULL,
	"plain_text" text DEFAULT '' NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provenance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"producer_kind" "producer_kind" NOT NULL,
	"producer_name" text NOT NULL,
	"pipeline" "pipeline_kind",
	"actor_user_id" uuid,
	"source_anchor_id" uuid,
	"run_id" text,
	"model" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"tier" "reference_tier" NOT NULL,
	"relevance_note" text NOT NULL,
	"source_anchor_id" uuid,
	"provenance_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"diagram_id" uuid,
	"source_anchor_id" uuid,
	"content" text NOT NULL,
	"embedding" vector(3072),
	"embedding_model" text,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_usages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_note_id" uuid NOT NULL,
	"context_note_id" uuid,
	"provenance_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"note_id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"trigger_hints" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_anchors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"node_id" text,
	"from_offset" integer,
	"to_offset" integer,
	"quote" text NOT NULL,
	"prefix" text,
	"suffix" text,
	"document_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_anchors_offsets_valid" CHECK ("source_anchors"."from_offset" is null or "source_anchors"."to_offset" is null or "source_anchors"."from_offset" <= "source_anchors"."to_offset")
);
--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"note_id" uuid,
	"kind" "suggestion_kind" NOT NULL,
	"status" "suggestion_status" DEFAULT 'proposed' NOT NULL,
	"payload" jsonb NOT NULL,
	"confidence" integer,
	"provenance_id" uuid NOT NULL,
	"source_anchor_id" uuid,
	"decided_by_id" uuid,
	"decided_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"applied_artifact_type" text,
	"applied_artifact_id" uuid,
	"is_auto_accepted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suggestions_confidence_range" CHECK ("suggestions"."confidence" is null or ("suggestions"."confidence" >= 0 and "suggestions"."confidence" <= 100))
);
--> statement-breakpoint
CREATE TABLE "todo_entities" (
	"todo_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	CONSTRAINT "todo_entities_todo_id_entity_id_pk" PRIMARY KEY("todo_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "todos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_id" uuid NOT NULL,
	"owner_id" uuid,
	"waiting_on_entity_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" "todo_status" DEFAULT 'open' NOT NULL,
	"responsibility" "todo_responsibility" DEFAULT 'mine' NOT NULL,
	"due_date" date,
	"due_date_verbatim" text,
	"promise_strength" "promise_strength",
	"source_anchor_id" uuid,
	"provenance_id" uuid,
	"completed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trust_policies" (
	"workspace_id" uuid NOT NULL,
	"pipeline" "pipeline_kind" NOT NULL,
	"auto_accept_enabled" boolean DEFAULT false NOT NULL,
	"minimum_confidence" integer,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trust_policies_workspace_id_pipeline_pk" PRIMARY KEY("workspace_id","pipeline"),
	CONSTRAINT "trust_policies_confidence_range" CHECK ("trust_policies"."minimum_confidence" is null or ("trust_policies"."minimum_confidence" >= 0 and "trust_policies"."minimum_confidence" <= 100))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "workspace_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_context_note_id_notes_id_fk" FOREIGN KEY ("context_note_id") REFERENCES "public"."notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagrams" ADD CONSTRAINT "diagrams_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagrams" ADD CONSTRAINT "diagrams_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagrams" ADD CONSTRAINT "diagrams_promoted_from_id_diagrams_id_fk" FOREIGN KEY ("promoted_from_id") REFERENCES "public"."diagrams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagrams" ADD CONSTRAINT "diagrams_source_anchor_id_source_anchors_id_fk" FOREIGN KEY ("source_anchor_id") REFERENCES "public"."source_anchors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagrams" ADD CONSTRAINT "diagrams_provenance_id_provenance_id_fk" FOREIGN KEY ("provenance_id") REFERENCES "public"."provenance"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_entities" ADD CONSTRAINT "note_entities_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_entities" ADD CONSTRAINT "note_entities_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_entities" ADD CONSTRAINT "note_entities_source_anchor_id_source_anchors_id_fk" FOREIGN KEY ("source_anchor_id") REFERENCES "public"."source_anchors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_entities" ADD CONSTRAINT "note_entities_provenance_id_provenance_id_fk" FOREIGN KEY ("provenance_id") REFERENCES "public"."provenance"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_relationships" ADD CONSTRAINT "note_relationships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_relationships" ADD CONSTRAINT "note_relationships_source_note_id_notes_id_fk" FOREIGN KEY ("source_note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_relationships" ADD CONSTRAINT "note_relationships_target_note_id_notes_id_fk" FOREIGN KEY ("target_note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_relationships" ADD CONSTRAINT "note_relationships_source_anchor_id_source_anchors_id_fk" FOREIGN KEY ("source_anchor_id") REFERENCES "public"."source_anchors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_relationships" ADD CONSTRAINT "note_relationships_provenance_id_provenance_id_fk" FOREIGN KEY ("provenance_id") REFERENCES "public"."provenance"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_parent_id_notes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provenance" ADD CONSTRAINT "provenance_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provenance" ADD CONSTRAINT "provenance_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provenance" ADD CONSTRAINT "provenance_source_anchor_id_source_anchors_id_fk" FOREIGN KEY ("source_anchor_id") REFERENCES "public"."source_anchors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "references" ADD CONSTRAINT "references_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "references" ADD CONSTRAINT "references_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "references" ADD CONSTRAINT "references_source_anchor_id_source_anchors_id_fk" FOREIGN KEY ("source_anchor_id") REFERENCES "public"."source_anchors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "references" ADD CONSTRAINT "references_provenance_id_provenance_id_fk" FOREIGN KEY ("provenance_id") REFERENCES "public"."provenance"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_chunks" ADD CONSTRAINT "search_chunks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_chunks" ADD CONSTRAINT "search_chunks_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_chunks" ADD CONSTRAINT "search_chunks_diagram_id_diagrams_id_fk" FOREIGN KEY ("diagram_id") REFERENCES "public"."diagrams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_chunks" ADD CONSTRAINT "search_chunks_source_anchor_id_source_anchors_id_fk" FOREIGN KEY ("source_anchor_id") REFERENCES "public"."source_anchors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_usages" ADD CONSTRAINT "skill_usages_skill_note_id_skills_note_id_fk" FOREIGN KEY ("skill_note_id") REFERENCES "public"."skills"("note_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_usages" ADD CONSTRAINT "skill_usages_context_note_id_notes_id_fk" FOREIGN KEY ("context_note_id") REFERENCES "public"."notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_usages" ADD CONSTRAINT "skill_usages_provenance_id_provenance_id_fk" FOREIGN KEY ("provenance_id") REFERENCES "public"."provenance"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_anchors" ADD CONSTRAINT "source_anchors_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_provenance_id_provenance_id_fk" FOREIGN KEY ("provenance_id") REFERENCES "public"."provenance"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_source_anchor_id_source_anchors_id_fk" FOREIGN KEY ("source_anchor_id") REFERENCES "public"."source_anchors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_entities" ADD CONSTRAINT "todo_entities_todo_id_todos_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_entities" ADD CONSTRAINT "todo_entities_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_waiting_on_entity_id_entities_id_fk" FOREIGN KEY ("waiting_on_entity_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_source_anchor_id_source_anchors_id_fk" FOREIGN KEY ("source_anchor_id") REFERENCES "public"."source_anchors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_provenance_id_provenance_id_fk" FOREIGN KEY ("provenance_id") REFERENCES "public"."provenance"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_policies" ADD CONSTRAINT "trust_policies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_policies" ADD CONSTRAINT "trust_policies_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_workspace_updated_idx" ON "conversations" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "diagrams_note_idx" ON "diagrams" USING btree ("note_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entities_workspace_type_name_unique" ON "entities" USING btree ("workspace_id","type",lower("name"));--> statement-breakpoint
CREATE INDEX "entities_workspace_type_idx" ON "entities" USING btree ("workspace_id","type");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "note_entities_entity_idx" ON "note_entities" USING btree ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "note_relationships_unique" ON "note_relationships" USING btree ("source_note_id","target_note_id","kind");--> statement-breakpoint
CREATE INDEX "note_relationships_target_kind_idx" ON "note_relationships" USING btree ("target_note_id","kind");--> statement-breakpoint
CREATE INDEX "notes_workspace_updated_idx" ON "notes" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "notes_parent_idx" ON "notes" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "notes_workspace_kind_idx" ON "notes" USING btree ("workspace_id","kind");--> statement-breakpoint
CREATE INDEX "provenance_workspace_created_idx" ON "provenance" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "references_note_idx" ON "references" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "search_chunks_note_idx" ON "search_chunks" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "search_chunks_workspace_idx" ON "search_chunks" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "skill_usages_skill_created_idx" ON "skill_usages" USING btree ("skill_note_id","created_at");--> statement-breakpoint
CREATE INDEX "skills_enabled_idx" ON "skills" USING btree ("is_enabled");--> statement-breakpoint
CREATE INDEX "source_anchors_note_idx" ON "source_anchors" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "suggestions_inbox_idx" ON "suggestions" USING btree ("workspace_id","status","created_at");--> statement-breakpoint
CREATE INDEX "suggestions_note_status_idx" ON "suggestions" USING btree ("note_id","status");--> statement-breakpoint
CREATE INDEX "todo_entities_entity_idx" ON "todo_entities" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "todos_workspace_status_idx" ON "todos" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "todos_owner_status_due_idx" ON "todos" USING btree ("owner_id","status","due_date");--> statement-breakpoint
CREATE INDEX "todos_waiting_due_idx" ON "todos" USING btree ("workspace_id","responsibility","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "workspace_members_user_idx" ON "workspace_members" USING btree ("user_id");
