CREATE TABLE "connector_icons" (
	"connector_id" uuid PRIMARY KEY NOT NULL,
	"media_type" text NOT NULL,
	"content" text NOT NULL,
	"checksum" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connector_icons_media_type_check" CHECK ("connector_icons"."media_type" in ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'))
);
--> statement-breakpoint
ALTER TABLE "connector_icons" ADD CONSTRAINT "connector_icons_connector_id_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connectors"("id") ON DELETE cascade ON UPDATE no action;