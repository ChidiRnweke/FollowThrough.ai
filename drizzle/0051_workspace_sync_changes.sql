-- Idempotent installation shared by migrations and db:push setup. Run in a transaction.
SELECT pg_advisory_xact_lock(hashtextextended('workspace-sync-setup', 0));
--> statement-breakpoint
-- Resolve ownership while the source row still exists. Persist it with the version so
-- cascading deletes can emit tombstones after their owning parent has disappeared.
CREATE OR REPLACE FUNCTION workspace_sync_account(resource text, data jsonb) RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
DECLARE owner uuid;
BEGIN
  CASE resource
    WHEN 'users' THEN owner := (data->>'id')::uuid;
    WHEN 'source_anchors', 'skills' THEN
      SELECT user_id INTO owner FROM notes WHERE id = (data->>'note_id')::uuid;
    WHEN 'skill_usages' THEN
      SELECT user_id INTO owner FROM notes WHERE id = (data->>'skill_note_id')::uuid;
    WHEN 'project_skill_pins' THEN
      SELECT p.user_id INTO owner FROM projects p JOIN notes n ON n.user_id = p.user_id
        WHERE p.id = (data->>'project_id')::uuid AND n.id = (data->>'skill_note_id')::uuid;
    WHEN 'attachment_versions' THEN
      SELECT user_id INTO owner FROM attachments WHERE id = (data->>'attachment_id')::uuid;
    WHEN 'todo_attachments' THEN
      SELECT t.user_id INTO owner FROM todos t JOIN attachments a ON a.user_id = t.user_id
        WHERE t.id = (data->>'todo_id')::uuid AND a.id = (data->>'attachment_id')::uuid;
    WHEN 'messages' THEN
      SELECT user_id INTO owner FROM conversations WHERE id = (data->>'conversation_id')::uuid;
    WHEN 'project_tool_overrides', 'export_settings' THEN
      SELECT user_id INTO owner FROM projects
        WHERE id = (data->>'project_id')::uuid AND user_id = (data->>'user_id')::uuid;
    ELSE owner := (data->>'user_id')::uuid;
  END CASE;
  IF owner IS NULL THEN RAISE EXCEPTION 'Cannot establish synchronization owner for %', resource; END IF;
  RETURN owner;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION advance_workspace_sync_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE identity jsonb; old_identity jsonb; row_data jsonb;
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    DELETE FROM workspace_sync_versions WHERE resource_type = TG_TABLE_NAME;
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD IS NOT DISTINCT FROM NEW THEN RETURN NEW; END IF;
  -- The app has no account-transfer operation. Enforce stable ownership so inherited
  -- child membership cannot change without its own journal entry.
  IF TG_OP = 'UPDATE' AND to_jsonb(OLD)->'user_id' IS DISTINCT FROM to_jsonb(NEW)->'user_id' THEN
    RAISE EXCEPTION 'Resource account ownership is immutable' USING ERRCODE = '23514';
  END IF;
  row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  SELECT jsonb_agg(row_data ->> field ORDER BY ordinal)
    INTO identity FROM unnest(TG_ARGV) WITH ORDINALITY AS fields(field, ordinal);
  IF TG_OP = 'DELETE' THEN
    DELETE FROM workspace_sync_versions WHERE resource_type = TG_TABLE_NAME AND resource_id = identity;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    SELECT jsonb_agg(to_jsonb(OLD) ->> field ORDER BY ordinal)
      INTO old_identity FROM unnest(TG_ARGV) WITH ORDINALITY AS fields(field, ordinal);
    IF old_identity <> identity THEN
      DELETE FROM workspace_sync_versions WHERE resource_type = TG_TABLE_NAME AND resource_id = old_identity;
    END IF;
  END IF;
  INSERT INTO workspace_sync_versions (resource_type, resource_id, account_id)
    VALUES (TG_TABLE_NAME, identity, workspace_sync_account(TG_TABLE_NAME, row_data))
    ON CONFLICT (resource_type, resource_id)
    DO UPDATE SET version = EXCLUDED.version, account_id = EXCLUDED.account_id;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION record_workspace_sync_change(owner uuid, resource text, identity jsonb,
  action text, resource_version bigint) RETURNS void LANGUAGE plpgsql AS $$
DECLARE next_cursor bigint;
BEGIN
  -- Updating this account's head holds a row lock until commit. A later committed
  -- cursor cannot overtake an uncommitted earlier one, unlike a sequence value.
  INSERT INTO workspace_sync_heads (account_id, cursor) VALUES (owner, 1)
    ON CONFLICT (account_id) DO UPDATE SET cursor = workspace_sync_heads.cursor + 1
    RETURNING cursor INTO next_cursor;
  INSERT INTO workspace_sync_changes (account_id, resource_type, resource_id, cursor, operation, version)
    VALUES (owner, resource, identity, next_cursor, action, resource_version)
    ON CONFLICT (account_id, resource_type, resource_id)
    DO UPDATE SET cursor = EXCLUDED.cursor, operation = EXCLUDED.operation, version = EXCLUDED.version;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION journal_workspace_sync_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM record_workspace_sync_change(OLD.account_id, OLD.resource_type, OLD.resource_id, 'delete', OLD.version);
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.account_id <> NEW.account_id THEN
    PERFORM record_workspace_sync_change(OLD.account_id, OLD.resource_type, OLD.resource_id, 'delete', OLD.version);
  END IF;
  PERFORM record_workspace_sync_change(NEW.account_id, NEW.resource_type, NEW.resource_id, 'upsert', NEW.version);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
-- Journal events run after domain locks, and remain atomic with the domain write.
DROP TRIGGER IF EXISTS workspace_sync_journal ON workspace_sync_versions;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER workspace_sync_journal
AFTER INSERT OR UPDATE OR DELETE ON workspace_sync_versions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION journal_workspace_sync_version();
--> statement-breakpoint
DO $$
DECLARE
  registration record;
  arguments text;
  identity_sql text;
BEGIN
  FOR registration IN SELECT * FROM (VALUES
    ('users', ARRAY['id']),
    ('projects', ARRAY['id']),
    ('notes', ARRAY['id']),
    ('source_anchors', ARRAY['id']),
    ('provenance', ARRAY['id']),
    ('todos', ARRAY['id']),
    ('note_relationships', ARRAY['id']),
    ('references', ARRAY['id']),
    ('diagrams', ARRAY['id']),
    ('skills', ARRAY['note_id']),
    ('project_skill_pins', ARRAY['project_id', 'skill_note_id']),
    ('attachments', ARRAY['id']),
    ('attachment_versions', ARRAY['id']),
    ('todo_attachments', ARRAY['todo_id', 'attachment_id']),
    ('skill_usages', ARRAY['id']),
    ('suggestions', ARRAY['id']),
    ('conversations', ARRAY['id']),
    ('messages', ARRAY['id']),
    ('agent_runs', ARRAY['id']),
    ('agent_preferences', ARRAY['user_id']),
    ('user_preferences', ARRAY['user_id']),
    ('tool_preferences', ARRAY['user_id', 'tool_name']),
    ('project_tool_overrides', ARRAY['user_id', 'project_id', 'tool_name']),
    ('trust_policies', ARRAY['user_id', 'pipeline']),
    ('memory_entries', ARRAY['id']),
    ('project_templates', ARRAY['id']),
    ('export_settings', ARRAY['user_id', 'project_id']),
    ('artifacts', ARRAY['id'])
  ) AS resources(table_name, key_columns) LOOP
    SELECT string_agg(quote_literal(field), ', ' ORDER BY ordinal),
           'to_jsonb(ARRAY[' || string_agg(format('%I::text', field), ', ' ORDER BY ordinal) || '])'
      INTO arguments, identity_sql
      FROM unnest(registration.key_columns) WITH ORDINALITY AS fields(field, ordinal);
    EXECUTE format('CREATE OR REPLACE TRIGGER workspace_sync_version AFTER INSERT OR UPDATE OR DELETE ON %I
      FOR EACH ROW EXECUTE FUNCTION advance_workspace_sync_version(%s)', registration.table_name, arguments);
    EXECUTE format('CREATE OR REPLACE TRIGGER workspace_sync_truncate AFTER TRUNCATE ON %I
      FOR EACH STATEMENT EXECUTE FUNCTION advance_workspace_sync_version()', registration.table_name);
    EXECUTE format('INSERT INTO workspace_sync_versions (resource_type, resource_id, account_id)
      SELECT %L, %s, workspace_sync_account(%L, to_jsonb(r)) FROM %I r ON CONFLICT (resource_type, resource_id) DO NOTHING', registration.table_name, identity_sql, registration.table_name, registration.table_name);
  END LOOP;
END;
$$;

--> statement-breakpoint
-- Flush seeded versions before filling any missing journal entries. Reinstallation
-- retains all existing checkpoints and tombstones.
SET CONSTRAINTS workspace_sync_journal IMMEDIATE;
--> statement-breakpoint
DO $$ DECLARE resource record; BEGIN
  FOR resource IN SELECT v.* FROM workspace_sync_versions v WHERE NOT EXISTS
    (SELECT 1 FROM workspace_sync_changes c WHERE c.account_id = v.account_id
      AND c.resource_type = v.resource_type AND c.resource_id = v.resource_id)
    ORDER BY account_id, resource_type, resource_id LOOP
    PERFORM record_workspace_sync_change(resource.account_id, resource.resource_type,
      resource.resource_id, 'upsert', resource.version);
  END LOOP;
END $$;
--> statement-breakpoint
SET CONSTRAINTS workspace_sync_journal DEFERRED;
