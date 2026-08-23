-- A persisted run is already attached to one conversation. Older snapshots
-- predate the resolved-input type and omitted that decided value. Backfill it
-- once in storage; runtime parsing stays strict and rejects missing/mismatched
-- snapshots instead of maintaining a compatibility path.
UPDATE "agent_runs"
SET "input_snapshot" =
	("input_snapshot" - 'input') ||
	jsonb_build_object(
		'conversationId', "conversation_id"::text,
		'prompt', COALESCE("input_snapshot" -> 'prompt', "input_snapshot" -> 'input')
	)
WHERE NOT ("input_snapshot" ? 'conversationId')
	OR NOT ("input_snapshot" ? 'prompt');
