import { describe, expect, it } from 'vitest';
import { NoteComparisonService } from './note-diff';
const comparison = new NoteComparisonService();
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
const kindsOf = (diff: {
	base: readonly { kind: string }[];
	candidate: readonly { kind: string }[];
}) => ({
	base: diff.base.map((block) => block.kind),
	candidate: diff.candidate.map((block) => block.kind)
});

const diffNoteDocuments = (base: ProseMirrorDocument, candidate: ProseMirrorDocument) => {
	const result = comparison.compare(base, candidate, { focus: false });
	return { base: result.base.kinds, candidate: result.candidate.kinds };
};
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

describe('comparison summary', () => {
	it('counts added and removed blocks', () => {
		expect(
			comparison.compare(
				doc(para('kept'), para('gone'), para('rewritten')),
				doc(para('kept'), para('rewritten differently'), para('fresh')),
				{ focus: false }
			).counts
		).toEqual({ added: 2, removed: 2 });
	});
	it('reports zero when nothing changed', () => {
		expect(
			comparison.compare(doc(para('same')), doc(para('same')), { focus: false }).counts
		).toEqual({ added: 0, removed: 0 });
	});
});
it('compares a rename while preserving identical body blocks as context', () => {
	const body = doc(para('Unchanged'));
	const result = comparison.compare(body, body, {
		focus: false,
		titles: { base: 'Before', candidate: 'After' }
	});
	expect({
		base: result.base.kinds.map((block) => block.kind),
		candidate: result.candidate.kinds.map((block) => block.kind)
	}).toEqual({ base: ['removed', 'context'], candidate: ['added', 'context'] });
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
		const side = comparison.compare(base, candidate, { focus: true }).candidate;
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
		const side = comparison.compare(before, after, { focus: true }).base;
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
});

const cell = (text: string): ProseMirrorNode => ({ type: 'tableCell', content: [para(text)] });
const row = (...texts: string[]): ProseMirrorNode => ({
	type: 'tableRow',
	content: texts.map(cell)
});
const table = (...rows: ProseMirrorNode[]): ProseMirrorNode => ({ type: 'table', content: rows });
const mermaid = (source: string): ProseMirrorNode => ({
	type: 'mermaid',
	content: [{ type: 'text', text: source }]
});

describe('diffNoteDocuments inside an edited block', () => {
	it('marks the changed word of a paragraph on each side', () => {
		const diff = diffNoteDocuments(
			doc(para('The quick brown fox')),
			doc(para('The slow brown fox'))
		);
		expect(diff).toEqual({
			base: [
				{
					index: 0,
					kind: 'edited',
					tone: 'removed',
					changes: [{ kind: 'text', textblock: 0, from: 4, to: 9 }]
				}
			],
			candidate: [
				{
					index: 0,
					kind: 'edited',
					tone: 'added',
					changes: [{ kind: 'text', textblock: 0, from: 4, to: 8 }]
				}
			]
		});
	});

	it('marks a rewritten phrase as one range rather than a range per word', () => {
		const diff = diffNoteDocuments(
			doc(para('Rollback plan: notes go here.')),
			doc(para('Rollback plan: revert the deploy.'))
		);
		const candidate = diff.candidate[0];
		expect(candidate.kind === 'edited' ? candidate.changes : []).toEqual([
			{ kind: 'text', textblock: 0, from: 15, to: 32 }
		]);
	});

	it('finds an edited table cell by its textblock and leaves the other cells alone', () => {
		const diff = diffNoteDocuments(
			doc(table(row('Owner', 'Due'), row('Ada', 'Monday'))),
			doc(table(row('Owner', 'Due'), row('Ada', 'Tuesday')))
		);
		expect(diff.candidate).toEqual([
			{
				index: 0,
				kind: 'edited',
				tone: 'added',
				changes: [{ kind: 'text', textblock: 3, from: 0, to: 7 }]
			}
		]);
	});

	it('marks the cells of an added table row whole', () => {
		const diff = diffNoteDocuments(
			doc(table(row('Owner', 'Due'), row('Ada', 'Monday'))),
			doc(table(row('Owner', 'Due'), row('Ada', 'Monday'), row('Grace', 'Friday')))
		);
		const candidate = diff.candidate[0];
		expect(candidate.kind === 'edited' ? candidate.changes : []).toEqual([
			{ kind: 'textblock', textblock: 4 },
			{ kind: 'textblock', textblock: 5 }
		]);
	});

	it('carries an edited diagram source as a line diff on the candidate side', () => {
		const diff = diffNoteDocuments(
			doc(mermaid('graph TD\n  A --> B\n  B --> C')),
			doc(mermaid('graph TD\n  A --> B\n  B --> D'))
		);
		expect(diff).toEqual({
			base: [{ index: 0, kind: 'removed' }],
			candidate: [
				{
					index: 0,
					kind: 'diagram-edited',
					lines: [
						{ kind: 'context', text: 'graph TD' },
						{ kind: 'context', text: '  A --> B' },
						{ kind: 'removed', text: '  B --> C' },
						{ kind: 'added', text: '  B --> D' }
					]
				}
			]
		});
	});

	it('detects a swapped widget and an edited formula, which carry no text', () => {
		const widget = (widgetId: string): ProseMirrorNode => ({
			type: 'widgetNode',
			attrs: { widgetId }
		});
		const formula = (latex: string): ProseMirrorNode => ({ type: 'blockMath', attrs: { latex } });
		expect(
			kindsOf(
				diffNoteDocuments(
					doc(widget('first'), formula('x^2')),
					doc(widget('second'), formula('x^3'))
				)
			)
		).toEqual({ base: ['removed', 'removed'], candidate: ['added', 'added'] });
	});
});

describe('alignRenderedBlocks', () => {
	const rendered = (...blocks: [type: string, empty?: boolean][]) =>
		blocks.map(([type, empty = false]) => ({ type, empty }));

	it('maps the spacers the editor inserts around a diagram and at the end to no stored block', () => {
		const stored = [heading('Architecture'), mermaid('graph TD'), heading('Next')];
		expect(
			comparison.align(
				stored,
				rendered(
					['heading'],
					['paragraph', true],
					['mermaid'],
					['paragraph', true],
					['heading'],
					['paragraph', true]
				)
			)
		).toEqual({ kind: 'aligned', storedIndex: [0, null, 1, null, 2, null] });
	});

	it('keeps an empty paragraph the note really has as a stored block', () => {
		const stored = [para('one'), { type: 'paragraph' } satisfies ProseMirrorNode, para('two')];
		expect(
			comparison.align(stored, rendered(['paragraph'], ['paragraph', true], ['paragraph']))
		).toEqual({ kind: 'aligned', storedIndex: [0, 1, 2] });
	});

	it('fails when the editor dropped content it could not load', () => {
		expect(comparison.align([para('one'), para('two')], rendered(['paragraph', true]))).toEqual({
			kind: 'failure'
		});
	});
});
