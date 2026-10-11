import { createTestAgentContext as createAgentContext } from '$lib/testing/agent/fixtures/context-formatter';
import { describe, expect, it } from 'vitest';
import type { RunAgentInput } from '$lib/models/agent';
import type { TextSelection } from '$lib/models/notes';
import { noteBuilder, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

describe('The pinned passages a run is built with', () => {
	const note = noteBuilder({ id: testNoteId(1), title: 'Q3 planning' });

	const selection = (overrides: Partial<TextSelection> = {}): TextSelection => ({
		noteId: note.id,
		revision: 1,
		from: 10,
		to: 32,
		text: 'Ship the export flow.',
		...overrides
	});

	const build = (input: Partial<Omit<RunAgentInput, 'conversationId'>>) =>
		createAgentContext().base(input, { kind: 'note', note });

	it('derives the active project from the resolved current note', () => {
		expect(build({}).projectId).toBe(note.projectId);
	});

	it('carries every pinned passage', async () => {
		const context = await build({
			noteId: note.id,
			selections: [selection(), selection({ from: 40, to: 55, text: 'Then review it.' })]
		});
		expect(context.selections).toHaveLength(2);
	});

	it('normalises a lone singular selection into the plural field', async () => {
		const context = await build({ noteId: note.id, selection: selection() });
		expect({
			excerpt: context.selections?.[0]?.text,
			hasLegacyField: 'selection' in context
		}).toEqual({
			excerpt: 'Ship the export flow.',
			hasLegacyField: false
		});
	});

	it('names the note a passage came from when that note is already loaded', async () => {
		const context = await build({ noteId: note.id, selections: [selection()] });
		expect(context.selections?.[0]?.title).toBe('Q3 planning');
	});

	it('leaves a passage from another note unnamed rather than reading it', async () => {
		const context = await build({
			noteId: note.id,
			selections: [selection({ noteId: testNoteId(2) })]
		});
		expect(context.selections?.[0]?.title).toBeUndefined();
	});

	it('prefers the plural field when a request carries both', async () => {
		const context = await build({
			noteId: note.id,
			selection: selection({ text: 'The stale one.' }),
			selections: [selection({ text: 'The pinned one.' })]
		});
		expect(context.selections?.[0]?.text).toBe('The pinned one.');
	});

	it('omits the field entirely when nothing was pinned', async () => {
		const context = await build({ noteId: note.id });
		expect(context).not.toHaveProperty('selections');
	});
});
