CREATE TABLE "project_tool_overrides" (
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"tool_name" text NOT NULL,
	"enabled" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_tool_overrides_user_id_project_id_tool_name_pk" PRIMARY KEY("user_id","project_id","tool_name")
);
--> statement-breakpoint
CREATE TABLE "tool_preferences" (
	"user_id" uuid NOT NULL,
	"tool_name" text NOT NULL,
	"enabled" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tool_preferences_user_id_tool_name_pk" PRIMARY KEY("user_id","tool_name")
);
--> statement-breakpoint
ALTER TABLE "project_tool_overrides" ADD CONSTRAINT "project_tool_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tool_overrides" ADD CONSTRAINT "project_tool_overrides_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_preferences" ADD CONSTRAINT "tool_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_tool_overrides_project_idx" ON "project_tool_overrides" USING btree ("user_id","project_id");