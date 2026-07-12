ALTER TYPE "public"."note_kind" ADD VALUE 'folder' BEFORE 'note';--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "projects" ("user_id", "name")
SELECT "id", 'Inbox' FROM "users";--> statement-breakpoint
ALTER TABLE "diagrams" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "references" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "search_chunks" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "waiting_on" text;--> statement-breakpoint
UPDATE "notes" SET "project_id" = "projects"."id"
FROM "projects" WHERE "projects"."user_id" = "notes"."user_id" AND "projects"."name" = 'Inbox';--> statement-breakpoint
UPDATE "todos" SET "project_id" = "projects"."id"
FROM "projects" WHERE "projects"."user_id" = "todos"."user_id" AND "projects"."name" = 'Inbox';--> statement-breakpoint
UPDATE "diagrams" SET "project_id" = "notes"."project_id"
FROM "notes" WHERE "notes"."id" = "diagrams"."note_id";--> statement-breakpoint
UPDATE "references" SET "project_id" = "notes"."project_id"
FROM "notes" WHERE "notes"."id" = "references"."note_id";--> statement-breakpoint
UPDATE "search_chunks" SET "project_id" = "notes"."project_id"
FROM "notes" WHERE "notes"."id" = "search_chunks"."note_id";--> statement-breakpoint
ALTER TABLE "diagrams" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "references" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "search_chunks" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "todos" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_user_name_unique" ON "projects" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE INDEX "projects_user_updated_idx" ON "projects" USING btree ("user_id","updated_at");--> statement-breakpoint
ALTER TABLE "diagrams" ADD CONSTRAINT "diagrams_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "references" ADD CONSTRAINT "references_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_chunks" ADD CONSTRAINT "search_chunks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "diagrams_project_idx" ON "diagrams" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "notes_project_parent_position_idx" ON "notes" USING btree ("project_id","parent_id","position");--> statement-breakpoint
CREATE INDEX "search_chunks_project_idx" ON "search_chunks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "todos_project_status_idx" ON "todos" USING btree ("project_id","status");
