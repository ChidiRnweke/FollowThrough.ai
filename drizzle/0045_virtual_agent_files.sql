CREATE TABLE "agent_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"path" text NOT NULL,
	"media_type" text NOT NULL,
	"content" text NOT NULL,
	"byte_size" integer NOT NULL,
	"token_count" integer NOT NULL,
	"line_count" integer NOT NULL,
	"checksum_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_files" ADD CONSTRAINT "agent_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_files" ADD CONSTRAINT "agent_files_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_files_conversation_path_unique" ON "agent_files" USING btree ("conversation_id","path");
--> statement-breakpoint
CREATE INDEX "agent_files_user_path_idx" ON "agent_files" USING btree ("user_id","path");
