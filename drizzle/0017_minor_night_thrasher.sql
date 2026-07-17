ALTER TABLE "agent_tool_effects" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "agent_tool_effects" CASCADE;--> statement-breakpoint
DROP INDEX "agent_runs_claim_idx";--> statement-breakpoint
ALTER TABLE "agent_runs" DROP COLUMN "attempt_count";--> statement-breakpoint
ALTER TABLE "agent_runs" DROP COLUMN "max_attempts";--> statement-breakpoint
ALTER TABLE "agent_runs" DROP COLUMN "next_attempt_at";--> statement-breakpoint
ALTER TABLE "agent_runs" DROP COLUMN "lease_owner";--> statement-breakpoint
ALTER TABLE "agent_runs" DROP COLUMN "lease_token";--> statement-breakpoint
ALTER TABLE "agent_runs" DROP COLUMN "lease_expires_at";--> statement-breakpoint
ALTER TABLE "agent_runs" DROP COLUMN "heartbeat_at";--> statement-breakpoint
DROP TYPE "public"."agent_tool_effect_state";