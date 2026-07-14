CREATE TYPE "public"."agent_execution_mode" AS ENUM('approval_required', 'auto_accept');--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('running', 'awaiting_approval', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "agent_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"default_model" text,
	"execution_mode" "agent_execution_mode" DEFAULT 'approval_required' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"model" text NOT NULL,
	"execution_mode" "agent_execution_mode" NOT NULL,
	"status" "agent_run_status" DEFAULT 'running' NOT NULL,
	"serialized_state" text,
	"pending_decisions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"failure" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "model_override" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "execution_mode_override" "agent_execution_mode";--> statement-breakpoint
ALTER TABLE "agent_preferences" ADD CONSTRAINT "agent_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_user_updated_idx" ON "agent_runs" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "agent_runs_conversation_status_idx" ON "agent_runs" USING btree ("conversation_id","status");