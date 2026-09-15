CREATE SEQUENCE "workspace_sync_version_sequence";
--> statement-breakpoint
CREATE TABLE "workspace_sync_versions" (
  "resource_type" text NOT NULL,
  "account_id" uuid NOT NULL,
  "resource_id" jsonb NOT NULL,
  "version" bigint NOT NULL DEFAULT nextval('workspace_sync_version_sequence'),
  PRIMARY KEY ("resource_type", "resource_id"),
  CHECK (jsonb_typeof("resource_id") = 'array'),
  CHECK ("version" > 0)
);
--> statement-breakpoint
-- A compact change journal: one latest change per account/resource, never application events.
CREATE TABLE workspace_sync_heads (
  account_id uuid PRIMARY KEY,
  cursor bigint NOT NULL CHECK (cursor > 0)
);
--> statement-breakpoint
CREATE TABLE workspace_sync_changes (
  account_id uuid NOT NULL,
  resource_type text NOT NULL,
  resource_id jsonb NOT NULL,
  cursor bigint NOT NULL CHECK (cursor > 0),
  operation text NOT NULL CHECK (operation IN ('upsert', 'delete')),
  version bigint NOT NULL CHECK (version > 0),
  PRIMARY KEY (account_id, resource_type, resource_id)
);
--> statement-breakpoint
CREATE INDEX workspace_sync_changes_cursor ON workspace_sync_changes (account_id, cursor);
--> statement-breakpoint
