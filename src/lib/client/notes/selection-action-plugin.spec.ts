import { describe, it, expect } from 'vitest';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { EditorState } from '@tiptap/pm/state';
import { createSelectionActionPlugin, selectionActionKey } from './selection-action-plugin';

const schema = getSchema([StarterKit]);

/** Positions 1..12 hold "Hello world." inside the single paragraph. */
const baseState = () =>
	EditorState.create({
		schema,
		doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Hello world.')])]),
		plugins: [createSelectionActionPlugin()]
	});

const held = (state: EditorState) =>
	(selectionActionKey.getState(state)?.find() ?? []).map(({ from, to }) => ({ from, to }));

const hold = (state: EditorState, from: number, to: number) =>
	state.apply(state.tr.setMeta(selectionActionKey, { from, to }));

describe('selection action plugin', () => {
	it('holds the range it is given', () => {
		expect(held(hold(baseState(), 1, 6))).toEqual([{ from: 1, to: 6 }]);
	});

	it('starts with nothing held', () => {
		expect(held(baseState())).toEqual([]);
	});

	it('maps the held range past text inserted before it', () => {
		const holding = hold(baseState(), 7, 13);
		const inserted = holding.apply(holding.tr.insertText('Well, ', 1));
		expect(held(inserted)).toEqual([{ from: 13, to: 19 }]);
	});

	it('keeps the held range when the document is untouched', () => {
		const holding = hold(baseState(), 1, 6);
		expect(held(holding.apply(holding.tr))).toEqual([{ from: 1, to: 6 }]);
	});

	it('releases the range on a null meta', () => {
		const holding = hold(baseState(), 1, 6);
		expect(held(holding.apply(holding.tr.setMeta(selectionActionKey, null)))).toEqual([]);
	});
});
