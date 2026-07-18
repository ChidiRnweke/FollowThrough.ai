ALTER TABLE "search_chunks" DROP CONSTRAINT IF EXISTS "search_chunks_single_source";--> statement-breakpoint
ALTER TABLE "search_chunks" ADD CONSTRAINT "search_chunks_single_source" CHECK (num_nonnulls("note_id", "memory_entry_id", "attachment_id") = 1);
