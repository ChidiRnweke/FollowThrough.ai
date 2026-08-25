CREATE TYPE "public"."project_role" AS ENUM('inbox', 'workspace');
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "role" "project_role" DEFAULT 'workspace' NOT NULL;
--> statement-breakpoint
UPDATE "projects"
SET "role" = 'inbox'
WHERE lower("name") = 'inbox' AND "archived_at" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "projects_user_inbox_unique" ON "projects" USING btree ("user_id") WHERE "projects"."role" = 'inbox';
--> statement-breakpoint
ALTER TABLE "diagrams" ADD COLUMN "archived_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX "diagrams_project_archived_idx" ON "diagrams" USING btree ("project_id", "archived_at");
