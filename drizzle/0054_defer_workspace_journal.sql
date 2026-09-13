-- Publish the journal after domain work has acquired its resource locks. Taking the
-- account head during each row write adds a head/row deadlock cycle to unrelated writers.
-- Deferred events retain OLD/NEW versions and still commit atomically with the domain rows.
DROP TRIGGER workspace_sync_journal ON workspace_sync_versions;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER workspace_sync_journal
AFTER INSERT OR UPDATE OR DELETE ON workspace_sync_versions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION journal_workspace_sync_version();
