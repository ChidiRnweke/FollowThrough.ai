ALTER TABLE "agent_preferences" ADD COLUMN "inline_model" text;--> statement-breakpoint
ALTER TABLE "agent_preferences" ADD COLUMN "attachment_vision_model" text;--> statement-breakpoint
ALTER TABLE "agent_preferences" ADD COLUMN "web_search_engine" text;--> statement-breakpoint
ALTER TABLE "agent_preferences" ADD COLUMN "web_search_max_results" integer;--> statement-breakpoint
ALTER TABLE "agent_preferences" ADD COLUMN "web_search_max_total_results" integer;--> statement-breakpoint
ALTER TABLE "agent_preferences" ADD COLUMN "agent_max_turns" integer;--> statement-breakpoint
ALTER TABLE "agent_preferences" ADD CONSTRAINT "agent_preferences_web_search_max_results_range" CHECK ("agent_preferences"."web_search_max_results" is null or ("agent_preferences"."web_search_max_results" >= 1 and "agent_preferences"."web_search_max_results" <= 50));--> statement-breakpoint
ALTER TABLE "agent_preferences" ADD CONSTRAINT "agent_preferences_web_search_max_total_results_range" CHECK ("agent_preferences"."web_search_max_total_results" is null or ("agent_preferences"."web_search_max_total_results" >= 1 and "agent_preferences"."web_search_max_total_results" <= 100));--> statement-breakpoint
ALTER TABLE "agent_preferences" ADD CONSTRAINT "agent_preferences_max_turns_range" CHECK ("agent_preferences"."agent_max_turns" is null or ("agent_preferences"."agent_max_turns" >= 1 and "agent_preferences"."agent_max_turns" <= 50));