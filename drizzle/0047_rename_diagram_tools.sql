-- The diagram tools were named after what they do to a canvas rather than to a
-- diagram. `present_diagram` is now `create_diagram` and `present_diagram_revision`
-- is `edit_diagram`, matching `create_note` and `edit_note`.
--
-- Tool names are persisted, so the rename is a data change as much as a code one:
-- transcripts, the message projection, run snapshots and events all carry them, and
-- the built-in Diagramming skill instructs the model to call them by name. Left
-- alone, that skill would name a tool that no longer exists.
--
-- The revision name is replaced first in every statement. It contains the other as
-- a prefix, so replacing the shorter one first would rewrite half of it and leave
-- `create_diagram_revision` behind.
UPDATE "agent_session_items"
SET "item" = replace(
	replace("item"::text, 'present_diagram_revision', 'edit_diagram'),
	'present_diagram', 'create_diagram'
)::jsonb
WHERE "item"::text LIKE '%present_diagram%';
--> statement-breakpoint
UPDATE "messages"
SET "content" = replace(
	replace("content"::text, 'present_diagram_revision', 'edit_diagram'),
	'present_diagram', 'create_diagram'
)::jsonb
WHERE "content"::text LIKE '%present_diagram%';
--> statement-breakpoint
UPDATE "agent_run_events"
SET "event" = replace(
	replace("event"::text, 'present_diagram_revision', 'edit_diagram'),
	'present_diagram', 'create_diagram'
)::jsonb
WHERE "event"::text LIKE '%present_diagram%';
--> statement-breakpoint
UPDATE "agent_runs"
SET "input_snapshot" = replace(
	replace("input_snapshot"::text, 'present_diagram_revision', 'edit_diagram'),
	'present_diagram', 'create_diagram'
)::jsonb
WHERE "input_snapshot"::text LIKE '%present_diagram%';
--> statement-breakpoint
UPDATE "agent_runs"
SET "serialized_state" = replace(
	replace("serialized_state"::text, 'present_diagram_revision', 'edit_diagram'),
	'present_diagram', 'create_diagram'
)::jsonb
WHERE "serialized_state"::text LIKE '%present_diagram%';
--> statement-breakpoint
UPDATE "notes"
SET
	"document" = replace(
		replace("document"::text, 'present_diagram_revision', 'edit_diagram'),
		'present_diagram', 'create_diagram'
	)::jsonb,
	"plain_text" = replace(
		replace("plain_text", 'present_diagram_revision', 'edit_diagram'),
		'present_diagram', 'create_diagram'
	)
WHERE "document"::text LIKE '%present_diagram%' OR "plain_text" LIKE '%present_diagram%';
--> statement-breakpoint
UPDATE "note_revisions"
SET
	"document" = replace(
		replace("document"::text, 'present_diagram_revision', 'edit_diagram'),
		'present_diagram', 'create_diagram'
	)::jsonb,
	"plain_text" = replace(
		replace("plain_text", 'present_diagram_revision', 'edit_diagram'),
		'present_diagram', 'create_diagram'
	)
WHERE "document"::text LIKE '%present_diagram%' OR "plain_text" LIKE '%present_diagram%';
