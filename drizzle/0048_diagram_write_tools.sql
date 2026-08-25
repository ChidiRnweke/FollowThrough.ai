-- Creating a diagram now writes a row, the way create_note writes a note, so a
-- conversation may produce more than one. The unique index made a second diagram
-- impossible rather than merely unusual, and turned provenance into ownership: a
-- diagram outlives the chat that drew it, and the chat is only where it came from.
DROP INDEX IF EXISTS "diagrams_conversation_unique";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagrams_conversation_idx" ON "diagrams" USING btree ("conversation_id");
