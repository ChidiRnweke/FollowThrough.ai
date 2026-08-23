import { describe, expect, it } from 'vitest';
import type { ContextSelection, RunAgentInput } from '$lib/models/agent';
import type { Note, NoteId, TextSelection } from '$lib/models/notes';
import type { ActorContext } from '$lib/models/identity';
import {
	noteBuilder,
	testActor,
	testConversationId,
	testNoteId,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { BaseAgentContext } from './base-context';

describe('BaseAgentContext', () => {
	it('is available as a domain service', () => {
		expect(BaseAgentContext).toBeTypeOf('function');
	});
});

describe('The pinned passages a run is built with', () => {
	const note = noteBuilder({ id: testNoteId(1), title: 'Q3 planning' });

	const readerFor = (found: Note) => ({
		get: async (_actor: ActorContext, noteId: NoteId): Promise<Note> => {
			if (noteId !== found.id) throw new Error(`No note ${noteId}`);
			return found;
		}
	});

	const selection = (overrides: Partial<TextSelection> = {}): TextSelection => ({
		noteId: note.id,
		revision: 1,
		from: 10,
		to: 32,
		text: 'Ship the export flow.',
		...overrides
	});

	const build = async (input: Partial<Omit<RunAgentInput, 'conversationId'>>) =>
		new BaseAgentContext(readerFor(note)).build(
			testActor(),
			{ conversationId: testConversationId(), prompt: 'Help', ...input },
			{
				provenanceId: testProvenanceId()
			}
		) as Promise<{ selections?: readonly ContextSelection[] }>;

	it('carries every pinned passage', async () => {
		const context = await build({
			noteId: note.id,
			selections: [selection(), selection({ from: 40, to: 55, text: 'Then review it.' })]
		});
		expect(context.selections).toHaveLength(2);
	});

	it('normalises a lone singular selection into the plural field', async () => {
		const context = await build({ noteId: note.id, selection: selection() });
		expect(context.selections?.[0]?.text).toBe('Ship the export flow.');
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

	/**
	 * The excerpt would otherwise reach the model twice — once here and once in the
	 * `<attached_selections>` block the user message carries.
	 */
	it('does not repeat the singular selection alongside the plural field', async () => {
		const context = await build({ noteId: note.id, selection: selection() });
		expect(context).not.toHaveProperty('selection');
	});
});
