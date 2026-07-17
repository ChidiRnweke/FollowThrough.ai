DO $$ BEGIN
	CREATE TYPE "public"."agent_run_decision" AS ENUM('approve', 'reject');
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "public"."agent_tool_effect_state" AS ENUM('started', 'completed');
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DROP INDEX IF EXISTS "agent_runs_active_conversation_unique";--> statement-breakpoint
ALTER TABLE "agent_runs" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "agent_runs" ALTER COLUMN "status" TYPE text USING "status"::text;--> statement-breakpoint
DROP TYPE IF EXISTS "public"."agent_run_status";--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('queued', 'running', 'awaiting_approval', 'cancelling', 'completed', 'failed', 'cancelled');--> statement-breakpoint
ALTER TABLE "agent_runs" ALTER COLUMN "status" TYPE "public"."agent_run_status" USING "status"::"public"."agent_run_status";--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_run_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"call_id" text NOT NULL,
	"decision" "agent_run_decision" NOT NULL,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_run_events" (
	"cursor" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "agent_run_events_cursor_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"run_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"event" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_tool_effects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"call_id" text NOT NULL,
	"attempt" integer NOT NULL,
	"tool_name" text NOT NULL,
	"arguments_hash" text NOT NULL,
	"state" "agent_tool_effect_state" NOT NULL,
	"output" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ALTER COLUMN "status" SET DEFAULT 'queued';--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "request_id" text DEFAULT gen_random_uuid()::text NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "max_attempts" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "lease_owner" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "lease_token" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "cancel_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "provenance_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "run_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "event_cursor" bigint;--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_run_decisions_run_id_agent_runs_id_fk') THEN
		ALTER TABLE "agent_run_decisions" ADD CONSTRAINT "agent_run_decisions_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_run_events_run_id_agent_runs_id_fk') THEN
		ALTER TABLE "agent_run_events" ADD CONSTRAINT "agent_run_events_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_tool_effects_run_id_agent_runs_id_fk') THEN
		ALTER TABLE "agent_tool_effects" ADD CONSTRAINT "agent_tool_effects_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_run_decisions_run_call_unique" ON "agent_run_decisions" USING btree ("run_id","call_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_run_events_run_cursor_idx" ON "agent_run_events" USING btree ("run_id","cursor");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_tool_effects_run_call_unique" ON "agent_tool_effects" USING btree ("run_id","call_id");--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_runs_provenance_id_provenance_id_fk') THEN
		ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_provenance_id_provenance_id_fk" FOREIGN KEY ("provenance_id") REFERENCES "public"."provenance"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_run_id_agent_runs_id_fk') THEN
		ALTER TABLE "messages" ADD CONSTRAINT "messages_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_event_cursor_agent_run_events_cursor_fk') THEN
		ALTER TABLE "messages" ADD CONSTRAINT "messages_event_cursor_agent_run_events_cursor_fk" FOREIGN KEY ("event_cursor") REFERENCES "public"."agent_run_events"("cursor") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
UPDATE "agent_runs"
SET "status" = 'failed',
	"failure" = coalesce("failure", 'Run interrupted while enabling durable execution'),
	"provider_error_code" = coalesce("provider_error_code", 'DURABLE_MIGRATION_INTERRUPTED'),
	"finished_at" = coalesce("finished_at", now()),
	"updated_at" = now()
WHERE "status" = 'running' AND "lease_token" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_runs_user_request_unique" ON "agent_runs" USING btree ("user_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_runs_active_conversation_unique" ON "agent_runs" USING btree ("conversation_id") WHERE "agent_runs"."status" in ('queued', 'running', 'awaiting_approval', 'cancelling');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_claim_idx" ON "agent_runs" USING btree ("status","next_attempt_at","lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "messages_event_cursor_unique" ON "messages" USING btree ("event_cursor");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "messages_assistant_run_unique" ON "messages" USING btree ("run_id") WHERE "messages"."role" = 'assistant' and "messages"."run_id" is not null;
