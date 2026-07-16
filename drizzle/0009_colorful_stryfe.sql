ALTER TYPE "public"."agent_run_status" ADD VALUE 'cancelled';--> statement-breakpoint
CREATE TABLE "agent_session_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"item" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachment_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"path" text NOT NULL,
	"object_key" text NOT NULL,
	"media_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"checksum_sha256" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachment_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attachment_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"media_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"checksum_sha256" text NOT NULL,
	"parser_kind" text,
	"extracted_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"path" text NOT NULL,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_revision_attachments" (
	"note_revision_id" uuid NOT NULL,
	"attachment_version_id" uuid NOT NULL,
	"path" text NOT NULL,
	CONSTRAINT "note_revision_attachments_note_revision_id_path_pk" PRIMARY KEY("note_revision_id","path")
);
--> statement-breakpoint
CREATE TABLE "project_skill_pins" (
	"project_id" uuid NOT NULL,
	"skill_note_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_skill_pins_project_id_skill_note_id_pk" PRIMARY KEY("project_id","skill_note_id")
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "provider_error_code" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "context_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "definition_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "slug" text;--> statement-breakpoint
WITH normalized AS (
	SELECT
		note_id,
		trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')) AS candidate,
		row_number() OVER (
			PARTITION BY trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'))
			ORDER BY created_at, note_id
		) AS duplicate_rank
	FROM skills
)
UPDATE skills
SET slug = CASE
	WHEN normalized.candidate = '' THEN 'skill-' || substring(skills.note_id::text, 1, 8)
	WHEN normalized.duplicate_rank = 1 THEN left(normalized.candidate, 64)
	ELSE left(normalized.candidate, 55) || '-' || normalized.duplicate_rank::text
END
FROM normalized
WHERE normalized.note_id = skills.note_id;--> statement-breakpoint
ALTER TABLE "skills" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "license" text;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "compatibility" text;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "allow_implicit_invocation" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_session_items" ADD CONSTRAINT "agent_session_items_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment_uploads" ADD CONSTRAINT "attachment_uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment_uploads" ADD CONSTRAINT "attachment_uploads_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment_versions" ADD CONSTRAINT "attachment_versions_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_current_version_id_attachment_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."attachment_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_revision_attachments" ADD CONSTRAINT "note_revision_attachments_note_revision_id_note_revisions_id_fk" FOREIGN KEY ("note_revision_id") REFERENCES "public"."note_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_revision_attachments" ADD CONSTRAINT "note_revision_attachments_attachment_version_id_attachment_versions_id_fk" FOREIGN KEY ("attachment_version_id") REFERENCES "public"."attachment_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_skill_pins" ADD CONSTRAINT "project_skill_pins_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_skill_pins" ADD CONSTRAINT "project_skill_pins_skill_note_id_skills_note_id_fk" FOREIGN KEY ("skill_note_id") REFERENCES "public"."skills"("note_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_session_items_position_unique" ON "agent_session_items" USING btree ("conversation_id","position");--> statement-breakpoint
CREATE INDEX "agent_session_items_conversation_idx" ON "agent_session_items" USING btree ("conversation_id","position");--> statement-breakpoint
CREATE INDEX "attachment_uploads_expiry_idx" ON "attachment_uploads" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "attachment_versions_object_key_unique" ON "attachment_versions" USING btree ("object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_note_path_unique" ON "attachments" USING btree ("note_id","path");--> statement-breakpoint
CREATE INDEX "attachments_note_idx" ON "attachments" USING btree ("note_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_note_slug_unique" ON "skills" USING btree ("note_id","slug");
