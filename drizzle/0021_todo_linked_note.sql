ALTER TABLE "todos" ADD COLUMN "linked_note_id" uuid;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_linked_note_id_notes_id_fk" FOREIGN KEY ("linked_note_id") REFERENCES "public"."notes"("id") ON DELETE set null ON UPDATE no action;
