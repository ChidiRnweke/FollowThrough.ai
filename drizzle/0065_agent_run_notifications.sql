-- Wake every listener on a run when the run row or its event log changes. NOTIFY is delivered at
-- commit, so a listener that reads after the notification sees the committed change, in any process.
-- The trigger argument names the column that holds the run id on each table.
CREATE OR REPLACE FUNCTION notify_agent_run() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	PERFORM pg_notify('agent_run:' || (to_jsonb(NEW) ->> TG_ARGV[0]), '');
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER agent_run_changed AFTER INSERT OR UPDATE ON agent_runs
	FOR EACH ROW EXECUTE FUNCTION notify_agent_run('id');
--> statement-breakpoint
CREATE TRIGGER agent_run_event_appended AFTER INSERT ON agent_run_events
	FOR EACH ROW EXECUTE FUNCTION notify_agent_run('run_id');
