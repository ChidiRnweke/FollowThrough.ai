CREATE TYPE "public"."conversation_kind" AS ENUM('chat', 'workflow');--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "kind" "conversation_kind" DEFAULT 'chat' NOT NULL;