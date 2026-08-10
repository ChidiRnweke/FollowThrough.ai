import { describe, it, expect } from 'vitest';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { EditorState } from '@tiptap/pm/state';
import { createSearchRevealPlugin, searchRevealKey } from './search-reveal-plugin';

const schema = getSchema([StarterKit]);

/** Positions 1..12 hold "Hello world." inside the single paragraph. */
const baseState = () =>
	EditorState.create({
		schema,
		doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Hello world.')])]),
		plugins: [createSearchRevealPlugin()]
	});

const lit = (state: EditorState) =>
	(searchRevealKey.getState(state)?.find() ?? []).map(({ from, to }) => ({ from, to }));

const reveal = (state: EditorState) =>
	state.apply(
		state.tr.setMeta(searchRevealKey, {
			primary: { from: 1, to: 6 },
			others: [{ from: 7, to: 12 }]
		})
	);

describe('search reveal plugin', () => {
	it('lights the clicked match and every other match', () => {
		expect(lit(reveal(baseState()))).toEqual([
			{ from: 1, to: 6 },
			{ from: 7, to: 12 }
		]);
	});

	it('starts with nothing lit', () => {
		expect(lit(baseState())).toEqual([]);
	});

	it('maps every lit range past text inserted before them', () => {
		const revealing = reveal(baseState());
		const inserted = revealing.apply(revealing.tr.insertText('Well, ', 1));
		expect(lit(inserted)).toEqual([
			{ from: 7, to: 12 },
			{ from: 13, to: 18 }
		]);
	});

	it('clears every lit range on a null meta', () => {
		const revealing = reveal(baseState());
		expect(lit(revealing.apply(revealing.tr.setMeta(searchRevealKey, null)))).toEqual([]);
	});
});
