import { describe, expect, it } from 'vitest';
import type { TextSelection } from '$lib/models/notes';
import { testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';
import { agentSelectionContext } from '$lib/factories/agent/selection-context';

describe('Pinning a passage to the composer', () => {
	const selection = (overrides: Partial<TextSelection> = {}): TextSelection => ({
		noteId: testNoteId(1),
		revision: 4,
		from: 12,
		to: 41,
		text: 'We ship the export flow first.',
		...overrides
	});

	it('labels the chip with the note it came from', () => {
		const chip = agentSelectionContext.pin(selection(), 'Q3 planning');
		expect({ name: chip.name, wordCount: chip.wordCount, excerpt: chip.selection.text }).toEqual({
			name: 'Q3 planning',
			wordCount: 6,
			excerpt: 'We ship the export flow first.'
		});
	});

	/** The dedup in `ChatStore.addChip` is by id, so this is what stops a double pin. */
	it('gives the same passage the same id whenever it is pinned', () => {
		expect(agentSelectionContext.pin(selection(), 'Q3 planning').id).toBe(
			agentSelectionContext.pin(selection(), 'Q3 planning').id
		);
	});

	it('gives two ranges of one note different ids', () => {
		expect(agentSelectionContext.pin(selection({ from: 60, to: 80 }), 'Q3 planning').id).not.toBe(
			agentSelectionContext.pin(selection(), 'Q3 planning').id
		);
	});

	it('gives the same range in two notes different ids', () => {
		expect(
			agentSelectionContext.pin(selection({ noteId: testNoteId(2) }), 'Q3 planning').id
		).not.toBe(agentSelectionContext.pin(selection(), 'Q3 planning').id);
	});
});

describe('The passage highlighted right now', () => {
	const selection = (overrides: Partial<TextSelection> = {}): TextSelection => ({
		noteId: testNoteId(1),
		revision: 4,
		from: 12,
		to: 41,
		text: 'We ship the export flow first.',
		...overrides
	});

	it('shows as a chip without anyone pinning it', () => {
		expect(
			agentSelectionContext.live(
				{ kind: 'selected', selection: selection(), noteTitle: 'Q3 planning' },
				[]
			)?.wordCount
		).toBe(6);
	});

	it('shows nothing when nothing is highlighted', () => {
		expect(agentSelectionContext.live({ kind: 'none' }, [])).toBeUndefined();
	});

	/** Otherwise the same passage would sit in the composer twice over. */
	it('steps aside once that same passage is pinned', () => {
		expect(
			agentSelectionContext.live(
				{ kind: 'selected', selection: selection(), noteTitle: 'Q3 planning' },
				[agentSelectionContext.pin(selection(), 'Q3 planning').id]
			)
		).toBeUndefined();
	});

	it('stays away once dismissed', () => {
		expect(
			agentSelectionContext.live(
				{ kind: 'selected', selection: selection(), noteTitle: 'Q3 planning' },
				[],
				agentSelectionContext.pin(selection(), 'Q3 planning').id
			)
		).toBeUndefined();
	});

	it('comes back for a different passage after a dismissal', () => {
		expect(
			agentSelectionContext.live(
				{
					kind: 'selected',
					selection: selection({ from: 60, to: 80, text: 'and the importer after that' }),
					noteTitle: 'Q3 planning'
				},
				[],
				agentSelectionContext.pin(selection(), 'Q3 planning').id
			)?.wordCount
		).toBe(5);
	});
});
