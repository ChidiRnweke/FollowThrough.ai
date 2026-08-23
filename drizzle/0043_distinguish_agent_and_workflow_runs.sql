ALTER TABLE "agent_runs" ADD COLUMN "kind" text;

UPDATE "agent_runs"
SET "kind" = CASE
	WHEN jsonb_typeof("input_snapshot" -> 'prompt') = 'string' THEN 'agent'
	ELSE 'workflow'
END;

ALTER TABLE "agent_runs" ALTER COLUMN "kind" SET NOT NULL;
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_kind_check" CHECK ("kind" IN ('agent', 'workflow'));
