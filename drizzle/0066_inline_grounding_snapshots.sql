CREATE TABLE "inline_grounding_snapshots" (
	"user_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"section_key" text NOT NULL,
	"project_passages" jsonb NOT NULL,
	"user_memory" jsonb NOT NULL,
	"knowledge_marker" text NOT NULL,
	"memory_marker" text NOT NULL,
	"built_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inline_grounding_snapshots_user_id_note_id_section_key_pk" PRIMARY KEY("user_id","note_id","section_key")
);
--> statement-breakpoint
ALTER TABLE "inline_grounding_snapshots" ADD CONSTRAINT "inline_grounding_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inline_grounding_snapshots" ADD CONSTRAINT "inline_grounding_snapshots_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;