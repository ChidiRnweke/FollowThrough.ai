import { describe, expect, it } from 'vitest';
import {
	REVISION_DIFF_LINE_LIMIT,
	diffNoteRevisionTexts,
	type RevisionText
} from './revision-diff';

const revisionText = (overrides: Partial<RevisionText> = {}): RevisionText => ({
	revision: 1,
	title: 'Architecture note',
	plainText: '',
	createdAt: '2026-08-01T09:00:00.000Z',
	...overrides
});

const longText = (prefix: string): string =>
	Array.from({ length: REVISION_DIFF_LINE_LIMIT * 2 }, (_, line) => `${prefix} ${line}`).join('\n');

describe('Diffing note revision texts', () => {
	it('produces an empty patch when nothing changed', () => {
		const before = revisionText({ plainText: 'Same body' });
		const after = revisionText({ revision: 2, plainText: 'Same body' });
		expect(diffNoteRevisionTexts(before, after).patch).toBe('');
	});

	it('reports a title change the body patch cannot show', () => {
		const before = revisionText({ title: 'Old title', plainText: 'Same body' });
		const after = revisionText({ revision: 2, title: 'New title', plainText: 'Same body' });
		expect(diffNoteRevisionTexts(before, after).patch).toBe('title: Old title → New title');
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

	it('truncates a patch that runs past the line limit', () => {
		const before = revisionText({ plainText: longText('old') });
		const after = revisionText({ revision: 2, plainText: longText('new') });
		expect(diffNoteRevisionTexts(before, after).truncated).toBe(true);
	});

	it('points a truncated patch at the full-content read', () => {
		const before = revisionText({ plainText: longText('old') });
		const after = revisionText({ revision: 2, plainText: longText('new') });
		expect(diffNoteRevisionTexts(before, after).patch).toContain('note versions directory');
	});
});
