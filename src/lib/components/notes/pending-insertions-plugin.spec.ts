import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { EditorState } from '@tiptap/pm/state';
import {
	createPendingInsertionsPlugin,
	getPendingInsertion,
	holdPendingInsertion,
	releasePendingInsertion
} from './pending-insertions-plugin';

const schema = getSchema([StarterKit]);

/** Positions 1..13 hold "Hello world." inside the single paragraph. */
const baseState = () =>
	EditorState.create({
		schema,
		doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Hello world.')])]),
		plugins: [createPendingInsertionsPlugin()]
	});

const hold = (state: EditorState, runId: string, position: number) =>
	state.apply(holdPendingInsertion(state.tr, runId, position));

describe('pending insertions plugin', () => {
	it('starts with nothing held', () => {
		expect(getPendingInsertion(baseState(), 'run-1')).toBeUndefined();
	});

	it('holds the point it is given', () => {
		expect(getPendingInsertion(hold(baseState(), 'run-1', 7), 'run-1')).toBe(7);
	});

	it('maps the held point past text inserted before it', () => {
		const holding = hold(baseState(), 'run-1', 7);
		const inserted = holding.apply(holding.tr.insertText('Well, ', 1));
		expect(getPendingInsertion(inserted, 'run-1')).toBe(13);
	});

	it('keeps the held point when the document is untouched', () => {
		const holding = hold(baseState(), 'run-1', 7);
		expect(getPendingInsertion(holding.apply(holding.tr), 'run-1')).toBe(7);
	});

	it('reports a point inside deleted content as lost', () => {
		const holding = hold(baseState(), 'run-1', 7);
		const deleted = holding.apply(holding.tr.delete(1, 13));
		expect(getPendingInsertion(deleted, 'run-1')).toBe('lost');
	});

	it('reports a point in a replaced document as lost', () => {
		const holding = hold(baseState(), 'run-1', 7);
		const paragraph = schema.node('paragraph');
		const replaced = holding.apply(holding.tr.replaceWith(0, 13, paragraph));
		expect(getPendingInsertion(replaced, 'run-1')).toBe('lost');
	});

	it('drops the point on release', () => {
		const holding = hold(baseState(), 'run-1', 7);
		const released = holding.apply(releasePendingInsertion(holding.tr, 'run-1'));
		expect(getPendingInsertion(released, 'run-1')).toBeUndefined();
	});

	it('maps each held run independently', () => {
		const one = hold(baseState(), 'run-1', 7);
		const both = one.apply(holdPendingInsertion(one.tr, 'run-2', 13));
		const inserted = both.apply(both.tr.insertText('Well, ', 1));
		expect(getPendingInsertion(inserted, 'run-1')).toBe(13);
	});
});
