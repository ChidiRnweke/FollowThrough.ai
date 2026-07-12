DELETE FROM "suggestions" WHERE "kind" = 'content_insertion';--> statement-breakpoint
ALTER TABLE "suggestions" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."suggestion_kind";--> statement-breakpoint
CREATE TYPE "public"."suggestion_kind" AS ENUM('todo', 'backlink', 'reference', 'diagram');--> statement-breakpoint
ALTER TABLE "suggestions" ALTER COLUMN "kind" SET DATA TYPE "public"."suggestion_kind" USING "kind"::"public"."suggestion_kind";
