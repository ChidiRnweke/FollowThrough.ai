ALTER TABLE "agent_preferences" ADD COLUMN "default_vision_model" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "vision_model_override" text;