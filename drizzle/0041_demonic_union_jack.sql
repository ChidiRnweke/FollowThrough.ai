CREATE TABLE "diagram_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diagram_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"title" text,
	"source" text NOT NULL,
	"rendered_svg" text,
	"searchable_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diagram_revisions_revision_positive" CHECK ("diagram_revisions"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "diagrams" ADD COLUMN "current_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "diagrams" ADD COLUMN "published_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "diagrams" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
UPDATE "diagrams" SET "published_at" = "updated_at" WHERE "kind" = 'drawio';--> statement-breakpoint
INSERT INTO "diagram_revisions" ("diagram_id", "revision", "title", "source", "rendered_svg", "searchable_text", "created_at")
SELECT "id", 1, "title", "source", "rendered_svg", "searchable_text", "updated_at"
FROM "diagrams" WHERE "kind" = 'drawio';--> statement-breakpoint
ALTER TABLE "diagram_revisions" ADD CONSTRAINT "diagram_revisions_diagram_id_diagrams_id_fk" FOREIGN KEY ("diagram_id") REFERENCES "public"."diagrams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "diagram_revisions_diagram_revision_unique" ON "diagram_revisions" USING btree ("diagram_id","revision");--> statement-breakpoint
CREATE INDEX "diagram_revisions_diagram_created_idx" ON "diagram_revisions" USING btree ("diagram_id","created_at");
