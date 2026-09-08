CREATE SEQUENCE "workspace_sync_version_sequence";
--> statement-breakpoint
CREATE TABLE "workspace_sync_versions" (
  "resource_type" text NOT NULL,
  "resource_id" jsonb NOT NULL,
  "version" bigint NOT NULL DEFAULT nextval('workspace_sync_version_sequence'),
  PRIMARY KEY ("resource_type", "resource_id"),
  CHECK (jsonb_typeof("resource_id") = 'array'),
  CHECK ("version" > 0)
);
--> statement-breakpoint
-- One function covers all writers, including worker writes and FK cascades.
-- Versions describe records, not commit order; no global cursor is inferred from this sequence.
CREATE FUNCTION advance_workspace_sync_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  identity jsonb;
  old_identity jsonb;
  row_data jsonb;
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    DELETE FROM workspace_sync_versions WHERE resource_type = TG_TABLE_NAME;
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD IS NOT DISTINCT FROM NEW THEN RETURN NEW; END IF;
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
  INSERT INTO workspace_sync_versions (resource_type, resource_id)
    VALUES (TG_TABLE_NAME, identity)
    ON CONFLICT (resource_type, resource_id)
    DO UPDATE SET version = EXCLUDED.version;
  RETURN NEW;
END;
$$;
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
    EXECUTE format('CREATE TRIGGER workspace_sync_version AFTER INSERT OR UPDATE OR DELETE ON %I
      FOR EACH ROW EXECUTE FUNCTION advance_workspace_sync_version(%s)', registration.table_name, arguments);
    EXECUTE format('CREATE TRIGGER workspace_sync_truncate AFTER TRUNCATE ON %I
      FOR EACH STATEMENT EXECUTE FUNCTION advance_workspace_sync_version()', registration.table_name);
    EXECUTE format('INSERT INTO workspace_sync_versions (resource_type, resource_id)
      SELECT %L, %s FROM %I', registration.table_name, identity_sql, registration.table_name);
  END LOOP;
END;
$$;
