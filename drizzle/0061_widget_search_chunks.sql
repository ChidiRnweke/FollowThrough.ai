ALTER TABLE "search_chunks" DROP CONSTRAINT "search_chunks_single_source";--> statement-breakpoint
ALTER TABLE "search_chunks" ADD COLUMN "widget_id" uuid;--> statement-breakpoint
ALTER TABLE "search_chunks" ADD CONSTRAINT "search_chunks_widget_id_widgets_id_fk" FOREIGN KEY ("widget_id") REFERENCES "public"."widgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "search_chunks_widget_idx" ON "search_chunks" USING btree ("widget_id");--> statement-breakpoint
ALTER TABLE "search_chunks" ADD CONSTRAINT "search_chunks_single_source" CHECK (num_nonnulls("search_chunks"."note_id", "search_chunks"."memory_entry_id", "search_chunks"."attachment_id", "search_chunks"."diagram_id", "search_chunks"."widget_id") = 1);