/**
 * Capture a corpus of real persisted shapes for the boundary conformance tests.
 *
 * Every model schema in this repository was, until now, tested only against
 * inputs written by hand or built by other code in the same repository — which
 * means every input came from the same mental model as the schema it was
 * checking. A schema and its fixtures agreed with each other and both disagreed
 * with the editor: `textAlign: null` sat in 659 of 663 stored values and no test
 * had ever seen one, because no test had ever been shown a document a person
 * actually typed.
 *
 * This script exists to break that loop. It reads what is genuinely stored and
 * commits it, so the conformance specs are checked against a producer that is
 * not the schema's author.
 *
 * Run against a database with real content:
 *
 *     pnpm corpus:capture
 *
 * The output is generated. Never hand-edit `tests/corpus/*.json`: an edited
 * corpus is a fixture again, and fixtures are what failed.
 *
 * Note text and anything URL-shaped is redacted. Structure, attribute keys and
 * value *types* are what the schemas check and are all preserved verbatim —
 * including the nulls and the extension-added keys that started this.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is required; the corpus is captured from a real database.');
	process.exit(1);
}

const sql = postgres(url);
const outputDir = resolve(import.meta.dirname, '../tests/corpus');

const URL_SHAPED = /^(https?:|data:|blob:|\/\/)/i;

/**
 * Redaction preserves the type of every value and the identity of every key.
 * A redacted string is still a string, a null is still a null, and an
 * attribute the schema has never heard of is still there under its own name.
 */
const redact = (value: unknown, key?: string): unknown => {
	if (Array.isArray(value)) return value.map((entry) => redact(entry));
	if (value !== null && typeof value === 'object')
		return Object.fromEntries(
			Object.entries(value).map(([childKey, child]) => [childKey, redact(child, childKey)])
		);
	if (typeof value !== 'string') return value;
	if (URL_SHAPED.test(value)) return 'https://redacted.invalid/asset';
	if (key === 'text' || key === 'plainText' || key === 'title' || key === 'source')
		return `«redacted ${value.length} chars»`;
	return value;
};

const write = (name: string, rows: readonly unknown[]): void => {
	const path = resolve(outputDir, `${name}.json`);
	writeFileSync(
		path,
		`${JSON.stringify(
			rows.map((row) => redact(row)),
			null,
			'\t'
		)}\n`
	);
	console.log(`${name.padEnd(26)} ${String(rows.length).padStart(4)} rows  ->  ${path}`);
};

mkdirSync(outputDir, { recursive: true });

write(
	'note-documents',
	(await sql`select document from notes order by id`).map((row) => row.document)
);
write(
	'note-revision-documents',
	(await sql`select document from note_revisions order by id`).map((row) => row.document)
);
write(
	'agent-session-items',
	(await sql`select item from agent_session_items order by conversation_id, position`).map(
		(row) => row.item
	)
);
// Aliased to the domain field names so the corpus feeds `parseProvenance`
// directly, the same way `toProvenance` does. Nulls are dropped for the same
// reason the mapper drops them: an absent optional is absent, not null.
write(
	'provenance-rows',
	(
		await sql`select id, user_id as "userId", producer_kind as "producerKind",
			producer_name as "producerName", pipeline, source_anchor_id as "sourceAnchorId",
			run_id as "runId", model, metadata, created_at as "createdAt"
			from provenance order by id`
	).map((row) =>
		Object.fromEntries(
			Object.entries({ ...row, createdAt: row.createdAt.toISOString() }).filter(
				([, value]) => value !== null
			)
		)
	)
);
write(
	'agent-run-events',
	(await sql`select event from agent_run_events order by cursor`).map((row) => row.event)
);
write(
	'agent-tool-messages',
	(await sql`select content from messages where role = 'tool' order by created_at, id`).map(
		(row) => row.content
	)
);
write('suggestion-payloads', await sql`select kind, payload from suggestions order by id`);
write(
	'agent-run-contexts',
	(
		await sql`select context_snapshot from agent_runs where context_snapshot is not null order by id`
	).map((row) => row.context_snapshot)
);

await sql.end();
