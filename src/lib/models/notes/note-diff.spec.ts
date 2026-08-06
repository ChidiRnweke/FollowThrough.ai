import { describe, expect, it } from 'vitest';
import { countNoteDiff, diffNoteDocuments, type DiffDocument, type NoteDiff } from './note-diff';

const para = (text: string) => ({
	type: 'paragraph',
	content: [{ type: 'text', text }]
});

const heading = (text: string) => ({
	type: 'heading',
	attrs: { level: 1 },
	content: [{ type: 'text', text }]
});

const doc = (...content: object[]): DiffDocument => ({ type: 'doc', content });

/** The classification of each side, as kinds only, so an assertion reads the property under test. */
const kindsOf = (diff: NoteDiff) => ({
	base: diff.base.map((block) => block.kind),
	candidate: diff.candidate.map((block) => block.kind)
});

describe('diffNoteDocuments', () => {
	it('is deterministic for the same pair of documents', () => {
		const base = doc(para('same'), para('gone'));
		const candidate = doc(para('same'), para('fresh'));
		expect(diffNoteDocuments(base, candidate)).toEqual(diffNoteDocuments(base, candidate));
	});

	it('flags nothing when the two documents are identical', () => {
		const document = doc(para('same'), heading('Same heading'));
		expect(kindsOf(diffNoteDocuments(document, document))).toEqual({
			base: ['context', 'context'],
			candidate: ['context', 'context']
		});
	});

	it('keeps equal blocks context even after an earlier insertion', () => {
		const base = doc(para('first'), para('last'));
		const candidate = doc(para('first'), para('inserted'), para('last'));
		expect(kindsOf(diffNoteDocuments(base, candidate))).toEqual({
			base: ['context', 'context'],
			candidate: ['context', 'added', 'context']
		});
	});

	it('classifies a deletion only on the base side', () => {
		const diff = diffNoteDocuments(doc(para('kept'), para('gone')), doc(para('kept')));
		expect(kindsOf(diff)).toEqual({
			base: ['context', 'removed'],
			candidate: ['context']
		});
	});

	it('classifies an insertion only on the candidate side', () => {
		const diff = diffNoteDocuments(doc(para('kept')), doc(para('kept'), para('fresh')));
		expect(kindsOf(diff)).toEqual({
			base: ['context'],
			candidate: ['context', 'added']
		});
	});

	it('reads a replacement as removed on the base and added on the candidate', () => {
		const diff = diffNoteDocuments(doc(para('old')), doc(para('new')));
		expect(kindsOf(diff)).toEqual({
			base: ['removed'],
			candidate: ['added']
		});
	});

	it('classifies every base block exactly once, in document order', () => {
		const base = doc(para('a'), para('b'), para('c'), para('d'));
		const candidate = doc(para('a'), para('x'), para('c'));
		const diff = diffNoteDocuments(base, candidate);
		expect(diff.base.map((block) => block.index)).toEqual([0, 1, 2, 3]);
	});

	it('classifies every candidate block exactly once, in document order', () => {
		const base = doc(para('a'), para('b'), para('c'), para('d'));
		const candidate = doc(para('a'), para('x'), para('c'));
		const diff = diffNoteDocuments(base, candidate);
		expect(diff.candidate.map((block) => block.index)).toEqual([0, 1, 2]);
	});

	it('ignores formatting-only differences when the text is unchanged', () => {
		const base = doc({
			type: 'paragraph',
			attrs: { unrelated: true },
			content: [{ type: 'text', text: 'same' }]
		});
		const candidate = doc(para('same'));
		expect(kindsOf(diffNoteDocuments(base, candidate))).toEqual({
			base: ['context'],
			candidate: ['context']
		});
	});
});

describe('countNoteDiff', () => {
	it('counts added and removed blocks', () => {
		const diff = diffNoteDocuments(
			doc(para('kept'), para('gone'), para('rewritten')),
			doc(para('kept'), para('rewritten differently'), para('fresh'))
		);
		expect(countNoteDiff(diff)).toEqual({ added: 2, removed: 2 });
	});

	it('reports zero when nothing changed', () => {
		expect(countNoteDiff(diffNoteDocuments(doc(para('same')), doc(para('same'))))).toEqual({
			added: 0,
			removed: 0
		});
	});
});
