-- A schedule's runs are a synchronized workspace resource (ADR 0040, ADR 0052). This installs the
-- same version and truncate triggers that 0051 installs for every other resource. Statements are
-- idempotent so `db:sync:setup` can re-run them on a push-managed development database.
CREATE OR REPLACE TRIGGER workspace_sync_version AFTER INSERT OR UPDATE OR DELETE ON schedule_occurrences
  FOR EACH ROW EXECUTE FUNCTION advance_workspace_sync_version('id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER workspace_sync_truncate AFTER TRUNCATE ON schedule_occurrences
  FOR EACH STATEMENT EXECUTE FUNCTION advance_workspace_sync_version();
--> statement-breakpoint
INSERT INTO workspace_sync_versions (resource_type, resource_id, account_id)
  SELECT 'schedule_occurrences', to_jsonb(ARRAY[r.id::text]),
    workspace_sync_account('schedule_occurrences', to_jsonb(r))
  FROM schedule_occurrences r
  ON CONFLICT (resource_type, resource_id) DO NOTHING;
