CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"prompt" text NOT NULL,
	"recurrence" jsonb NOT NULL,
	"time_zone" text NOT NULL,
	"execution_mode" "agent_execution_mode" NOT NULL,
	"status" text NOT NULL,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedules_status_check" CHECK ("schedules"."status" in ('active', 'paused', 'finished')),
	CONSTRAINT "schedules_next_run_check" CHECK (("schedules"."status" = 'active') = ("schedules"."next_run_at" is not null)),
	CONSTRAINT "schedules_recurrence_check" CHECK (jsonb_typeof("schedules"."recurrence") = 'object')
);
--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "schedules_due_idx" ON "schedules" USING btree ("next_run_at") WHERE "schedules"."status" = 'active';--> statement-breakpoint
CREATE INDEX "schedules_user_idx" ON "schedules" USING btree ("user_id","created_at");