import { ChatMentionService } from './mentions';
import { createMentionHistory } from '$lib/models/chat';
const mentions = new ChatMentionService();
import { describe, expect, it } from 'vitest';

import type { ResourceChip } from '$lib/models/chat';
import { testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

const first: ResourceChip = { kind: 'note', id: testNoteId(1), name: 'Research' };
const second: ResourceChip = { kind: 'note', id: testNoteId(2), name: 'Research' };
const pair = (other: ResourceChip = second) => {
	let history = mentions.add(createMentionHistory('Compare @'), first);
	history = mentions.edit(history, {
		from: history.present.text.length,
		to: history.present.text.length,
		text: 'and @'
	});
	return mentions.add(history, other);
};

describe('mentions attached to resource identities', () => {
	it('removes only the selected resource when two names are identical', () => {
		const result = mentions.remove(pair(), first).present;
		expect({ text: result.text, ids: result.references.map(({ chip }) => chip.id) }).toEqual({
			text: 'Compare and @Research ',
			ids: [second.id]
		});
	});
	it('does not remove a longer title that starts with the removed title', () => {
		const result = mentions.remove(pair({ ...second, name: 'Research plan' }), first).present;
		expect({ text: result.text, ids: result.references.map(({ chip }) => chip.id) }).toEqual({
			text: 'Compare and @Research plan ',
			ids: [second.id]
		});
	});
	it('drops only the first identity when its exact text range is deleted', () => {
		const result = mentions.edit(pair(), { from: 8, to: 18, text: '' }).present;
		expect(result.references.map(({ chip }) => chip.id)).toEqual([second.id]);
	});
	it('detaches a mention when its label is edited', () => {
		const result = mentions.edit(pair(), { from: 10, to: 11, text: 'x' }).present;
		expect(result.references.map(({ chip }) => chip.id)).toEqual([second.id]);
	});
	it('does not treat a longer typed word as the original mention', () => {
		const result = mentions.edit(pair(), { from: 17, to: 17, text: 'er' }).present;
		expect(result.references.map(({ chip }) => chip.id)).toEqual([second.id]);
	});
	it('keeps identities aligned when text is inserted before both mentions', () => {
		const edited = mentions.edit(pair(), { from: 0, to: 0, text: 'Please ' });
		expect(mentions.remove(edited, first).present.text).toBe('Please Compare and @Research ');
	});
	it('restores both original identities on undo', () => {
		const original = pair();
		const edited = mentions.edit(original, { from: 8, to: 18, text: '' });
		const restored = mentions.restore(edited, original.present.text, 'undo');
		expect(restored.kind === 'restored' ? restored.history.present : restored).toEqual(
			original.present
		);
	});
	it('restores the exact remaining identity on redo', () => {
		const original = pair();
		const edited = mentions.edit(original, { from: 8, to: 18, text: '' });
		const undone = mentions.restore(edited, original.present.text, 'undo');
		if (undone.kind !== 'restored') throw new Error('Expected tracked undo');
		const redone = mentions.restore(undone.history, edited.present.text, 'redo');
		expect(redone.kind === 'restored' ? redone.history.present : redone).toEqual(edited.present);
	});
	it('removes repeated references to one resource together', () => {
		expect(mentions.remove(pair(first), first).present).toEqual({
			text: 'Compare and ',
			references: []
		});
	});
	it('keeps replacement-like characters in a title literal', () => {
		expect(
			mentions.add(createMentionHistory('Read @'), { ...first, name: '$& budget' }).present.text
		).toBe('Read @$& budget ');
	});
});
