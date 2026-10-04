import { describe, expect, it } from 'vitest';
import { diffNoteRevisionTexts } from './revision-diff';
import { type RevisionText } from '$lib/models/notes/revision-diff';

const revisionText = (overrides: Partial<RevisionText> = {}): RevisionText => ({
	revision: 1,
	title: 'Architecture note',
	plainText: '',
	createdAt: '2026-08-01T09:00:00.000Z',
	...overrides
});

const longText = (prefix: string): string =>
	Array.from({ length: 400 }, (_, line) => `${prefix} ${line}`).join('\n');

describe('Diffing note revision texts', () => {
	it('produces an empty patch when nothing changed', () => {
		const before = revisionText({ plainText: 'Same body' });
		const after = revisionText({ revision: 2, plainText: 'Same body' });
		expect(diffNoteRevisionTexts(before, after).patch).toBe('');
	});

	it('labels the patch with the revision it runs to', () => {
		const before = revisionText({ plainText: 'before' });
		const after = revisionText({ revision: 2, plainText: 'after' });
		expect(diffNoteRevisionTexts(before, after).patch).toContain('revision 2 (2026-08-01)');
	});

	it('counts the lines a change adds', () => {
		const before = revisionText({ plainText: 'keep\nold line' });
		const after = revisionText({ revision: 2, plainText: 'keep\nnew line\nextra' });
		expect(diffNoteRevisionTexts(before, after).addedLines).toBe(2);
	});

	it('counts the lines a change removes', () => {
		const before = revisionText({ plainText: 'keep\nold line' });
		const after = revisionText({ revision: 2, plainText: 'keep\nnew line\nextra' });
		expect(diffNoteRevisionTexts(before, after).removedLines).toBe(1);
	});

	it('includes the final changed line of a large patch', () => {
		const before = revisionText({ plainText: longText('old') });
		const after = revisionText({ revision: 2, plainText: longText('new') });
		expect(diffNoteRevisionTexts(before, after).patch).toContain('+new 399');
	});
});

it('counts added body lines that resemble unified patch headers', () => {
	const before = revisionText({ plainText: 'before\n' });
	const after = revisionText({ revision: 2, plainText: '++counter\n+++flag\n' });
	expect(diffNoteRevisionTexts(before, after).addedLines).toBe(2);
});
it('counts removed body lines that resemble unified patch headers', () => {
	const before = revisionText({ plainText: '--counter\n---\n' });
	const after = revisionText({ revision: 2, plainText: 'after\n' });
	expect(diffNoteRevisionTexts(before, after).removedLines).toBe(2);
});

it('reports a title-only change without inventing changed body lines', () => {
	const before = revisionText({ plainText: 'Same body' });
	const after = revisionText({ title: 'Renamed note', plainText: 'Same body' });
	expect(diffNoteRevisionTexts(before, after)).toEqual({
		patch: 'title: Architecture note → Renamed note',
		addedLines: 0,
		removedLines: 0
	});
});
it('keeps full change totals for a large patch', () => {
	const before = revisionText({ plainText: longText('--old') });
	const after = revisionText({ revision: 2, plainText: longText('++new') });
	expect(diffNoteRevisionTexts(before, after)).toMatchObject({
		addedLines: 400,
		removedLines: 400
	});
});
