-- `AgentEvent` carried one settled arm for a tool call, with an optional `output`
-- beside an optional `failure`. That is three facts in two fields: a call that
-- returned nothing, a call whose result reported its own failure (ADR 0035), and
-- a call that produced no usable result at all. It made a fourth state sayable
-- that no producer produces, and both readers answered the ambiguity the same
-- way — branch on `failure`, drop the `output` — so a call that returned its
-- failure as a value lost the occurrence counts and nearest matches it came with.
--
-- The union is `tool_succeeded` | `tool_reported_failure` | `tool_failed` now,
-- and `readAgentEvent` has no branch for the old shape: a compatibility arm in
-- the reader is a second definition of the union that nothing forces to stay
-- correct. So the rows move here instead.
--
-- The mapping is what the rows carry, not a guess about them. Of the 147 stored
-- `tool_completed` rows, all carried an `output`, and the 30 that also carried a
-- `failure` carried it because the tool returned that failure as a value — so the
-- value is kept, on the arm that has somewhere to keep it. A row with a failure
-- and no output has no result to show and becomes `tool_failed`.
--
-- Order matters: each statement narrows what the next one still sees, so the
-- unconditional pass at the end can only reach rows that carry no failure.
UPDATE "agent_run_events"
SET "event" = jsonb_set("event", '{type}', '"tool_reported_failure"')
WHERE "event"->>'type' = 'tool_completed'
	AND "event" ? 'failure'
	AND "event" ? 'output';
--> statement-breakpoint
UPDATE "agent_run_events"
SET "event" = jsonb_set("event", '{type}', '"tool_failed"')
WHERE "event"->>'type' = 'tool_completed' AND "event" ? 'failure';
--> statement-breakpoint
UPDATE "agent_run_events"
SET "event" = jsonb_set("event", '{type}', '"tool_succeeded"')
WHERE "event"->>'type' = 'tool_completed';
