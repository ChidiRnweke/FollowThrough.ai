ALTER TABLE "agent_preferences" ADD COLUMN "inline_suggestions_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "search_chunks" ADD COLUMN "source_title" text;--> statement-breakpoint
ALTER TABLE "search_chunks" ADD COLUMN "section_path" text;