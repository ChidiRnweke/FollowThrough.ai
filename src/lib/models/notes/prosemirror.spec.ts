import { describe, expect, it } from 'vitest';
import {
	findProseMirrorDocumentIssue,
	readProseMirrorDocument,
	unknownProseMirrorNodes
} from './index';

describe('ProseMirror document invariants', () => {
	it('accepts a structurally valid nested document', () => {
		expect(
			findProseMirrorDocumentIssue({
				type: 'doc',
				content: [
					{
						type: 'bulletList',
						content: [
							{
								type: 'listItem',
								content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Valid' }] }]
							}
						]
					}
				]
			})
		).toBeUndefined();
	});

	it('reports the path of a text node without a type', () => {
		expect(
			findProseMirrorDocumentIssue({
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ text: 'Broken' }] }]
			})?.path
		).toBe('$.content[0].content[0].type');
	});

	it('rejects strong wrappers because bold formatting belongs on text marks', () => {
		expect(
			findProseMirrorDocumentIssue({
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [{ type: 'strong', content: [{ type: 'text', text: 'Broken' }] }]
					}
				]
			})?.path
		).toBe('$.content[0].content[0].type');
	});
});

/**
 * The producer's defaults, pinned here as well as in the editor conformance
 * spec. That one proves the editor emits them; these prove the schema accepts
 * them without needing a DOM, so a regression fails in the fastest test first.
 */
describe('attributes the editor actually writes', () => {
	it('accepts the null textAlign that TextAlign defaults to', () => {
		expect(
			findProseMirrorDocumentIssue({
				type: 'doc',
				content: [{ type: 'paragraph', attrs: { textAlign: null }, content: [] }]
			})
		).toBeUndefined();
	});

	it('accepts the anchor attributes TableOfContents adds to a heading', () => {
		expect(
			findProseMirrorDocumentIssue({
				type: 'doc',
				content: [
					{
						type: 'heading',
						attrs: { level: 2, textAlign: null, id: 'anchor', 'data-toc-id': 'anchor' },
						content: []
					}
				]
			})
		).toBeUndefined();
	});

	it('accepts an image height stored as a number rather than a string', () => {
		expect(
			findProseMirrorDocumentIssue({
				type: 'doc',
				content: [{ type: 'image', attrs: { src: 'https://example.test/a.png', height: 80 } }]
			})
		).toBeUndefined();
	});

	// Open by construction: any extension may add a global attribute to any node,
	// which is how `data-toc-id` arrived. Rejecting them made the schema a list of
	// every extension ever configured.
	it('keeps an attribute no extension in this repo writes yet', () => {
		expect(
			findProseMirrorDocumentIssue({
				type: 'doc',
				content: [{ type: 'paragraph', attrs: { textAlign: null, 'data-future': 'x' } }]
			})
		).toBeUndefined();
	});
});

describe('reading a document out of storage', () => {
	const withUnknownBlock = {
		type: 'doc',
		content: [
			{ type: 'paragraph', content: [{ type: 'text', text: 'Fine' }] },
			{ type: 'compaction', summary: 'from a newer editor' }
		]
	};

	it('degrades an unmodelled block instead of throwing', () => {
		expect(unknownProseMirrorNodes(readProseMirrorDocument(withUnknownBlock))).toHaveLength(1);
	});

	it('names the type it could not read', () => {
		expect(unknownProseMirrorNodes(readProseMirrorDocument(withUnknownBlock))[0]?.reason).toContain(
			'compaction'
		);
	});

	it('keeps the blocks around it intact', () => {
		expect(readProseMirrorDocument(withUnknownBlock).content?.[0]?.type).toBe('paragraph');
	});

	it('keeps the unreadable block whole so it round-trips', () => {
		const [unknown] = unknownProseMirrorNodes(readProseMirrorDocument(withUnknownBlock));
		expect(unknown?.raw).toEqual({ type: 'compaction', summary: 'from a newer editor' });
	});

	// The write boundary must not accept what the read boundary tolerates:
	// `saveNote` and the importer still reject an unmodelled block outright.
	it('is still rejected at the write boundary', () => {
		expect(findProseMirrorDocumentIssue(withUnknownBlock)).toBeDefined();
	});

	it('answers with a document even when the column is not one', () => {
		expect(readProseMirrorDocument('not a document').type).toBe('doc');
	});
});
