import { expect, it } from 'vitest';
import { readMentionInput } from './mention-input';

it('uses the selected range to distinguish identical mention text', () => {
	expect(
		readMentionInput('@Research @Research ', '@Research ', { from: 0, to: 10 }, 'deleteByCut')
	).toEqual({ kind: 'edit', edit: { from: 0, to: 10, text: '' } });
});
it('normalizes backward deletion from a collapsed caret', () => {
	expect(readMentionInput('abc', 'ac', { from: 2, to: 2 }, 'deleteContentBackward')).toEqual({
		kind: 'edit',
		edit: { from: 1, to: 2, text: '' }
	});
});
it('normalizes forward deletion from a collapsed caret', () => {
	expect(readMentionInput('abc', 'ac', { from: 1, to: 1 }, 'deleteContentForward')).toEqual({
		kind: 'edit',
		edit: { from: 1, to: 2, text: '' }
	});
});
it('does not invent an edit when the browser selection no longer matches', () => {
	expect(readMentionInput('abc', 'changed', { from: 1, to: 2 }, 'insertText')).toEqual({
		kind: 'untracked'
	});
});
