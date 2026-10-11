CREATE TABLE "maintenance_cursors" (
	"task" text PRIMARY KEY NOT NULL,
	"position" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
