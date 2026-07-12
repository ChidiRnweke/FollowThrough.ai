ALTER TABLE "entities" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "note_entities" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "todo_entities" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "todos" DROP CONSTRAINT "todos_waiting_on_entity_id_entities_id_fk";--> statement-breakpoint
DROP TABLE "note_entities" CASCADE;--> statement-breakpoint
DROP TABLE "todo_entities" CASCADE;--> statement-breakpoint
DROP TABLE "entities" CASCADE;--> statement-breakpoint
ALTER TABLE "note_relationships" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."relationship_kind";--> statement-breakpoint
CREATE TYPE "public"."relationship_kind" AS ENUM('prior_decision', 'contradicts', 'elaborates', 'mentions');--> statement-breakpoint
ALTER TABLE "note_relationships" ALTER COLUMN "kind" SET DATA TYPE "public"."relationship_kind" USING "kind"::"public"."relationship_kind";--> statement-breakpoint
ALTER TABLE "todos" DROP COLUMN "waiting_on_entity_id";
