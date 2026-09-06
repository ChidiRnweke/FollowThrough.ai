import { beforeAll, describe, expect, it } from 'vitest';
import noteDocuments from '../corpus/note-documents.json' with { type: 'json' };
import sessionItems from '../corpus/agent-session-items.json' with { type: 'json' };
import toolMessages from '../corpus/agent-tool-messages.json' with { type: 'json' };
import messageContents from '../corpus/agent-message-contents.json' with { type: 'json' };
import provenanceRows from '../corpus/provenance-rows.json' with { type: 'json' };
import suggestionPayloads from '../corpus/suggestion-payloads.json' with { type: 'json' };
import { readProseMirrorDocument, unknownProseMirrorNodes } from '$lib/models/notes';
import { z } from 'zod';
import { parseSessionItem, readAgentEvent } from '$lib/models/agent';
import { readAgentToolName } from '$lib/models/agent/tool-catalog';
import { readAgentPayloadObject } from '$lib/models/agent/payload';
import { readJournalledTool } from '$lib/stores/agent/chat-tools';
import { parseProvenance } from '$lib/models/provenance';
import { parseSuggestionPayload, readSuggestionPayload } from '$lib/models/suggestions';

let runEvents: readonly unknown[];
let noteRevisionDocuments: readonly unknown[];

beforeAll(async () => {
	runEvents = (await import('../corpus/agent-run-events.json', { with: { type: 'json' } })).default;
	noteRevisionDocuments = (
		await import('../corpus/note-revision-documents.json', { with: { type: 'json' } })
	).default;
});

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

describe('the stored agent run events', () => {
	it('all read back into a modelled arm, so none is dropped from a replay', () => {
		const unreadable = runEvents.flatMap((event) => {
			const read = readAgentEvent(event);
			return read.kind === 'unreadable' ? [read.reason] : [];
		});
		expect([...new Set(unreadable)].sort()).toEqual([]);
	});
});

/**
 * Every row of `messages.content`, not only the tool ones.
 *
 * The column was handed out under `jsonb('content').$type<AgentPayloadObject>()`
 * with nothing checking it, and `listMessages` maps every row of a conversation:
 * one row the column could hold but the type could not describe was one dead
 * transcript. `StoredMessage.unreadable` keeps that from taking the page down,
 * and this asserts the arm stays empty against real rows so the resilience does
 * not become a hiding place.
 */
describe('the stored message contents', () => {
	it('all read as a payload object', () => {
		const unreadable = messageContents.flatMap((content) => {
			const read = readAgentPayloadObject(content);
			return read.kind === 'corrupt' ? [read.message] : [];
		});
		expect([...new Set(unreadable)].sort()).toEqual([]);
	});
});

/**
 * The transcript is what a reopened conversation shows, and it is rebuilt from
 * these rows alone. A row this reader cannot reconstruct renders as a call that
 * says it could not be read — visible rather than silent, but still a turn that
 * shows less than it did.
 */
describe('the stored tool journal rows', () => {
	it('all restore into a transcript row', () => {
		const unreadable = toolMessages.flatMap((content) => {
			const read = readJournalledTool(content, {});
			return read.kind === 'unreadable' ? [read.reason] : [];
		});
		expect([...new Set(unreadable)].sort()).toEqual([]);
	});
});

/**
 * The names in both journals, checked against the agent surface itself.
 *
 * `AgentToolName` is the catalog plus `search_tools`, and that one exception is
 * the whole reason this assertion exists: `search_tools` is assembled inside
 * `AgentTools.agentTools()` rather than defined, so it is bound to no controller
 * method and has no `TOOL_DESCRIPTIONS` entry, and every persisted tool name
 * used to be a bare `string` to make room for it. 38 event rows and 10 tool
 * messages carry it; nothing else is outside the catalog.
 *
 * The run-event check is not the same one as above. `readAgentEvent` reports an
 * unreadable row for any reason, so an added arm or a loosened field would keep
 * it green while a name quietly drifted. This reads the name itself.
 */
const journalledToolNames = (rows: readonly unknown[]): readonly string[] =>
	rows.flatMap((row) => {
		const named = z.object({ name: z.string() }).safeParse(row);
		return named.success ? [named.data.name] : [];
	});

describe('the tool names in both stored journals', () => {
	it('are all names the agent surface has', () => {
		const names = [...journalledToolNames(runEvents), ...journalledToolNames(toolMessages)];
		expect([...new Set(names.filter((name) => readAgentToolName(name) === undefined))]).toEqual([]);
	});

	it('include the one name that is not in the catalog, so the check is not vacuous', () => {
		expect(journalledToolNames(runEvents)).toContain('search_tools');
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
