ALTER TABLE "search_chunks" DROP CONSTRAINT IF EXISTS "search_chunks_single_source";--> statement-breakpoint
ALTER TABLE "diagrams" DROP CONSTRAINT "diagrams_note_id_notes_id_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "diagrams_note_idx";--> statement-breakpoint
-- Renamed in place rather than dropped and re-added: the column holds every
-- existing diagram's note, and drizzle-kit's non-interactive fallback for an
-- ambiguous rename is ADD COLUMN + DROP COLUMN, which discards all of it.
ALTER TABLE "diagrams" RENAME COLUMN "note_id" TO "source_note_id";--> statement-breakpoint
ALTER TABLE "diagrams" ALTER COLUMN "source_note_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "diagrams" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "diagrams" ADD CONSTRAINT "diagrams_source_note_id_notes_id_fk" FOREIGN KEY ("source_note_id") REFERENCES "public"."notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagrams" ADD CONSTRAINT "diagrams_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "diagrams_source_note_idx" ON "diagrams" USING btree ("source_note_id");--> statement-breakpoint
CREATE UNIQUE INDEX "diagrams_conversation_unique" ON "diagrams" USING btree ("conversation_id");--> statement-breakpoint
-- Diagram chunks used to carry their note as well as their diagram, which the
-- widened single-source CHECK no longer allows. A diagram now stands as its own
-- retrieval source; the note it came from keeps its own chunks, which inline the
-- diagram's text separately.
UPDATE "search_chunks" SET "note_id" = NULL WHERE "diagram_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "search_chunks" ADD CONSTRAINT "search_chunks_single_source" CHECK (num_nonnulls("search_chunks"."note_id", "search_chunks"."memory_entry_id", "search_chunks"."attachment_id", "search_chunks"."diagram_id") = 1);
