import { describe, expect, it } from 'vitest';
import type { TextSelection } from '$lib/models/notes';
import { testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';
import { liveSelectionChipOf, selectionChipIdOf, selectionChipOf } from './selection-chip';

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
		expect(selectionChipOf(selection(), 'Q3 planning').name).toBe('Q3 planning');
	});

	it('counts the words in the passage', () => {
		expect(selectionChipOf(selection(), 'Q3 planning').wordCount).toBe(6);
	});

	it('keeps the passage itself, so the request carries what was pinned', () => {
		expect(selectionChipOf(selection(), 'Q3 planning').selection.text).toBe(
			'We ship the export flow first.'
		);
	});

	/** The dedup in `ChatStore.addChip` is by id, so this is what stops a double pin. */
	it('gives the same passage the same id whenever it is pinned', () => {
		expect(selectionChipIdOf(selection())).toBe(selectionChipIdOf(selection()));
	});

	it('gives two ranges of one note different ids', () => {
		expect(selectionChipIdOf(selection({ from: 60, to: 80 }))).not.toBe(
			selectionChipIdOf(selection())
		);
	});

	it('gives the same range in two notes different ids', () => {
		expect(selectionChipIdOf(selection({ noteId: testNoteId(2) }))).not.toBe(
			selectionChipIdOf(selection())
		);
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
		expect(liveSelectionChipOf(selection(), 'Q3 planning', [])?.wordCount).toBe(6);
	});

	it('shows nothing when nothing is highlighted', () => {
		expect(liveSelectionChipOf(undefined, 'Q3 planning', [])).toBeUndefined();
	});

	/** Otherwise the same passage would sit in the composer twice over. */
	it('steps aside once that same passage is pinned', () => {
		expect(
			liveSelectionChipOf(selection(), 'Q3 planning', [selectionChipIdOf(selection())])
		).toBeUndefined();
	});

	it('stays away once dismissed', () => {
		expect(
			liveSelectionChipOf(selection(), 'Q3 planning', [], selectionChipIdOf(selection()))
		).toBeUndefined();
	});

	it('comes back for a different passage after a dismissal', () => {
		expect(
			liveSelectionChipOf(
				selection({ from: 60, to: 80, text: 'and the importer after that' }),
				'Q3 planning',
				[],
				selectionChipIdOf(selection())
			)?.wordCount
		).toBe(5);
	});
});
