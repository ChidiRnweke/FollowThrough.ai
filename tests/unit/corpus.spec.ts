import { describe, expect, it } from 'vitest';
import noteDocuments from '../corpus/note-documents.json' with { type: 'json' };
import noteRevisionDocuments from '../corpus/note-revision-documents.json' with { type: 'json' };
import sessionItems from '../corpus/agent-session-items.json' with { type: 'json' };
import provenanceRows from '../corpus/provenance-rows.json' with { type: 'json' };
import suggestionPayloads from '../corpus/suggestion-payloads.json' with { type: 'json' };
import { readProseMirrorDocument, unknownProseMirrorNodes } from '$lib/models/notes';
import { parseSessionItem } from '$lib/models/agent';
import { parseProvenance } from '$lib/models/provenance';
import { parseSuggestionPayload, readSuggestionPayload } from '$lib/models/suggestions';

/**
 * Every schema in this repository, checked against what is genuinely stored.
 *
 * This is the test that was missing. `proseMirrorDocumentSchema` shipped strict
 * and took `/today` down on the first real page load, because every test that
 * had ever validated it was fed either a hand-written literal with no `attrs`
 * at all or the output of `noteContentFromMarkdown`, which never instantiates a
 * ProseMirror node and so never materializes an attribute default. Both inputs
 * were written by the same mental model as the schema. Both agreed with it.
 * Neither was the editor.
 *
 * The corpus is captured by `pnpm corpus:capture` and is generated, not
 * authored, which is the entire point — see `scripts/capture-corpus.ts`.
 *
 * **These assertions are about degradation, not about throwing.** Every one of
 * these boundaries now has a fallback arm so a schema gap degrades one row
 * instead of taking down a page. That resilience would quietly absorb the next
 * `textAlign` and nobody would learn anything. Asserting that the corpus parses
 * with *zero* fallback arms is what keeps the schemas honest: the arm protects
 * production, and this test refuses to let it become a hiding place.
 */

const reasons = (entries: readonly { readonly reason: string }[]): readonly string[] =>
	[...new Set(entries.map((entry) => entry.reason))].sort();

describe('the stored note documents', () => {
	it('all read back as documents', () => {
		expect(noteDocuments.map((document) => readProseMirrorDocument(document).type)).toEqual(
			noteDocuments.map(() => 'doc')
		);
	});

	it('contain no node the schema failed to model', () => {
		const unknown = noteDocuments.flatMap((document) =>
			unknownProseMirrorNodes(readProseMirrorDocument(document))
		);
		expect(reasons(unknown)).toEqual([]);
	});
});

describe('the stored note revisions', () => {
	it('contain no node the schema failed to model', () => {
		const unknown = noteRevisionDocuments.flatMap((document) =>
			unknownProseMirrorNodes(readProseMirrorDocument(document))
		);
		expect(reasons(unknown)).toEqual([]);
	});
});

describe('the stored agent session items', () => {
	it('all parse into a modelled arm', () => {
		const unrecognised = sessionItems
			.map((item) => parseSessionItem(item))
			.filter((item) => item.type === 'unrecognised');
		expect(reasons(unrecognised)).toEqual([]);
	});
});

/**
 * Provenance stays strict and throwing, deliberately. It is read only by
 * `ProvenanceRecords.findById` — a single-row lookup, never a list map — so a
 * bad row fails one caption rather than a page, and the arm that is worth a
 * union rewrite for notes is not worth one here. What it does need is this: a
 * check that the rows really do parse.
 */
/**
 * Vacuous today: the `suggestions` table holds no rows, so this asserts over an
 * empty list and proves nothing yet. It is here anyway, and the topology audit
 * requires it, because the alternative is that the first suggestion ever stored
 * is also the first one anybody parses — which is exactly how the notes
 * boundary shipped.
 */
describe('the stored suggestion payloads', () => {
	const rows: readonly {
		readonly kind: Parameters<typeof parseSuggestionPayload>[0];
		readonly payload: unknown;
	}[] = suggestionPayloads;

	it('are all readable, so none is dropped from the inbox', () => {
		const unreadable = rows.flatMap((row) => {
			const read = readSuggestionPayload(row.kind, row.payload);
			return read.status === 'unreadable' ? [`${row.kind}: ${read.reason}`] : [];
		});
		expect(unreadable).toEqual([]);
	});

	it('also satisfy the strict parser the write path uses', () => {
		const failures = rows.flatMap((row) => {
			try {
				parseSuggestionPayload(row.kind, row.payload);
				return [];
			} catch (error) {
				return [error instanceof Error ? error.message : String(error)];
			}
		});
		expect(failures).toEqual([]);
	});
});

describe('the stored provenance rows', () => {
	it('all parse', () => {
		const failures = provenanceRows.flatMap((row) => {
			try {
				parseProvenance(row);
				return [];
			} catch (error) {
				return [error instanceof Error ? error.message : String(error)];
			}
		});
		expect(failures).toEqual([]);
	});
});
