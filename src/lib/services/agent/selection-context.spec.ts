import { expect, it } from 'vitest';
import { SelectionContextService } from './selection-context';
import { testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';
const rules = new SelectionContextService();
const selection = { noteId: testNoteId(), revision: 4, from: 12, to: 19, text: 'Ship it' };
it('freezes the selected passage under its note and range identity', () => {
	expect(rules.pin(selection, 'Planning', 2)).toEqual({
		kind: 'selection',
		id: `${testNoteId()}:12-19`,
		name: 'Planning',
		wordCount: 2,
		selection
	});
});
it('keeps a pinned passage from also appearing as live context', () => {
	const chip = rules.pin(selection, 'Planning', 2);
	expect(rules.live(chip, [`${testNoteId()}:12-19`])).toBeUndefined();
});
