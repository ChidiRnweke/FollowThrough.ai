import { describe, expect, it } from 'vitest';
import { countNoteDiff, diffNoteDocuments, focusNoteDiffSide, withTitleBlock } from './note-diff';
import type { NoteDiff } from '$lib/models/notes/note-diff';
import type {
	ProseMirrorDocument,
	ProseMirrorNode,
	ProseMirrorParagraphNode,
	ProseMirrorHeadingNode
} from '$lib/models/notes';

const para = (text: string): ProseMirrorParagraphNode => ({
	type: 'paragraph',
	content: [{ type: 'text', text }]
});

const heading = (text: string): ProseMirrorHeadingNode => ({
	type: 'heading',
	attrs: { level: 1 },
	content: [{ type: 'text', text }]
});

const doc = (...content: ProseMirrorNode[]): ProseMirrorDocument => ({ type: 'doc', content });

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

		expect(diff.candidate.map((block) => block.index)).toEqual([0, 1, 2]);
	});

	it('ignores formatting-only differences when the text is unchanged', () => {
		const base = doc({
			type: 'paragraph',
			attrs: { textAlign: 'center' },
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

it('compares a rename while preserving identical body blocks as context', () => {
	const body = doc(para('Unchanged'));
	expect(
		kindsOf(diffNoteDocuments(withTitleBlock(body, 'Before'), withTitleBlock(body, 'After')))
	).toEqual({ base: ['removed', 'context'], candidate: ['added', 'context'] });
});
it('detects a changed diagram identity inside a textless nested block', () => {
	const before = doc({
		type: 'blockquote',
		content: [{ type: 'drawio', attrs: { diagramId: 'first' } }]
	});
	const after = doc({
		type: 'blockquote',
		content: [{ type: 'drawio', attrs: { diagramId: 'second' } }]
	});
	expect(kindsOf(diffNoteDocuments(before, after))).toEqual({
		base: ['removed'],
		candidate: ['added']
	});
});

describe('focusNoteDiffSide', () => {
	const paragraphs = (count: number) =>
		Array.from({ length: count }, (_, index) => para(`p${index + 1}`));

	/** Each focused block's text and kind, so an assertion reads the folded document. */
	const outline = (base: ProseMirrorDocument, candidate: ProseMirrorDocument) => {
		const diff = diffNoteDocuments(base, candidate);
		const side = focusNoteDiffSide(candidate, diff.candidate);
		return side.kinds.map((block) => {
			const node = side.document.content?.[block.index];
			const text = node?.type === 'paragraph' ? node.content?.[0] : undefined;
			return `${block.kind}:${text?.type === 'text' ? text.text : ''}`;
		});
	};

	it('keeps one edit mid-document with a neighbour each side and folds the rest', () => {
		const before = paragraphs(10);
		const after = before.map((block, index) => (index === 4 ? para('edited') : block));
		expect(outline(doc(...before), doc(...after))).toEqual([
			'elided:3 unchanged blocks',
			'context:p4',
			'added:edited',
			'context:p6',
			'elided:4 unchanged blocks'
		]);
	});

	it('keeps two distant edits as separate hunks with a fold between them', () => {
		const before = paragraphs(9);
		const after = before.map((block, index) =>
			index === 1 ? para('first edit') : index === 7 ? para('second edit') : block
		);
		expect(outline(doc(...before), doc(...after))).toEqual([
			'context:p1',
			'added:first edit',
			'context:p3',
			'elided:3 unchanged blocks',
			'context:p7',
			'added:second edit',
			'context:p9'
		]);
	});

	it('merges edits whose context touches into one hunk', () => {
		const before = paragraphs(5);
		const after = before.map((block, index) =>
			index === 1 ? para('a') : index === 3 ? para('b') : block
		);
		expect(outline(doc(...before), doc(...after))).toEqual([
			'context:p1',
			'added:a',
			'context:p3',
			'added:b',
			'context:p5'
		]);
	});

	it('folds a side with no change of its own to a single singular-safe marker', () => {
		const before = doc(...paragraphs(6));
		const after = doc(...paragraphs(6), para('appended'));
		const diff = diffNoteDocuments(before, after);
		const side = focusNoteDiffSide(before, diff.base);
		expect({ kinds: side.kinds, content: side.document.content }).toEqual({
			kinds: [{ index: 0, kind: 'elided' }],
			content: [para('6 unchanged blocks')]
		});
	});

	it('names a single folded block in the singular', () => {
		const before = paragraphs(3);
		const after = before.map((block, index) => (index === 2 ? para('edited') : block));
		expect(outline(doc(...before), doc(...after))[0]).toBe('elided:1 unchanged block');
	});

	it('refuses classifications that do not match the document', () => {
		expect(() =>
			focusNoteDiffSide(doc(para('one'), para('two')), [{ index: 0, kind: 'added' }])
		).toThrow('1 classifications for 2 blocks');
	});
});
