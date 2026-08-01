ALTER TABLE "search_chunks" ADD COLUMN "source_created_at" timestamp with time zone;
UPDATE "search_chunks" AS chunks
SET "source_created_at" = COALESCE(
	(SELECT created_at FROM diagrams WHERE id = chunks.diagram_id),
	(SELECT created_at FROM attachments WHERE id = chunks.attachment_id),
	(SELECT created_at FROM memory_entries WHERE id = chunks.memory_entry_id),
	(SELECT created_at FROM notes WHERE id = chunks.note_id),
	chunks.created_at
);
ALTER TABLE "search_chunks" ALTER COLUMN "source_created_at" SET DEFAULT now();
ALTER TABLE "search_chunks" ALTER COLUMN "source_created_at" SET NOT NULL;
