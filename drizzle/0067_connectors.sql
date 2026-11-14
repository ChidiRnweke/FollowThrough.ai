CREATE TABLE "connector_authorizations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"state_hash" text NOT NULL,
	"sealed_request" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connector_tools" (
	"connector_id" uuid NOT NULL,
	"server_name" text NOT NULL,
	"model_name" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"input_schema" jsonb,
	"unusable_reason" text,
	"hints" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"policy" text,
	"embedding" halfvec(3072),
	"embedding_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connector_tools_connector_id_server_name_pk" PRIMARY KEY("connector_id","server_name"),
	CONSTRAINT "connector_tools_schema_check" CHECK (("connector_tools"."input_schema" is null) <> ("connector_tools"."unusable_reason" is null)),
	CONSTRAINT "connector_tools_policy_check" CHECK ("connector_tools"."policy" is null or "connector_tools"."policy" in ('allow', 'ask', 'off')),
	CONSTRAINT "connector_tools_embedding_check" CHECK (("connector_tools"."input_schema" is null) = ("connector_tools"."embedding" is null) and ("connector_tools"."embedding" is null) = ("connector_tools"."embedding_model" is null))
);
--> statement-breakpoint
CREATE TABLE "connectors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"source_kind" text NOT NULL,
	"catalog_id" text,
	"title" text NOT NULL,
	"server_url" text NOT NULL,
	"auth_kind" text NOT NULL,
	"sealed_credential" text,
	"status" text NOT NULL,
	"status_reason" text,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tools_refreshed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connectors_source_kind_check" CHECK ("connectors"."source_kind" in ('catalog', 'custom')),
	CONSTRAINT "connectors_catalog_id_check" CHECK (("connectors"."source_kind" = 'catalog') = ("connectors"."catalog_id" is not null)),
	CONSTRAINT "connectors_auth_kind_check" CHECK ("connectors"."auth_kind" in ('none', 'bearer', 'oauth')),
	CONSTRAINT "connectors_credential_check" CHECK (("connectors"."auth_kind" = 'none') = ("connectors"."sealed_credential" is null)),
	CONSTRAINT "connectors_status_check" CHECK ("connectors"."status" in ('connected', 'reauthorization_required')),
	CONSTRAINT "connectors_status_reason_check" CHECK (("connectors"."status" = 'connected') = ("connectors"."status_reason" is null))
);
--> statement-breakpoint
ALTER TABLE "connector_authorizations" ADD CONSTRAINT "connector_authorizations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_tools" ADD CONSTRAINT "connector_tools_connector_id_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connectors" ADD CONSTRAINT "connectors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connector_authorizations_state_hash_unique" ON "connector_authorizations" USING btree ("state_hash");--> statement-breakpoint
CREATE INDEX "connector_authorizations_user_idx" ON "connector_authorizations" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connector_tools_model_name_unique" ON "connector_tools" USING btree ("connector_id","model_name");--> statement-breakpoint
CREATE UNIQUE INDEX "connectors_user_slug_unique" ON "connectors" USING btree ("user_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "connectors_user_catalog_unique" ON "connectors" USING btree ("user_id","catalog_id");