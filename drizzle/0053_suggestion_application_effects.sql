CREATE TABLE "suggestion_application_effects" (
	"suggestion_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"effect" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "suggestion_application_effects" ADD CONSTRAINT "suggestion_application_effects_suggestion_id_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."suggestions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion_application_effects" ADD CONSTRAINT "suggestion_application_effects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
