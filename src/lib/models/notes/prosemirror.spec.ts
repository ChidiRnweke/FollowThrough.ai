import { describe, expect, it } from 'vitest';
import { proseMirrorDocumentSchema, storedDocumentReadSchema } from './index';
import { unreadableDocumentBlocks } from '$lib/testing/notes/fixtures/unreadable-documents';

describe('ProseMirror document invariants', () => {
	it('accepts a structurally valid nested document', () => {
		expect(
			proseMirrorDocumentSchema.safeParse({
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
			}).error?.issues[0]
		).toBeUndefined();
	});

	it('reports the path of a text node without a type', () => {
		expect(
			proseMirrorDocumentSchema.safeParse({
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ text: 'Broken' }] }]
			}).error?.issues[0]?.path
		).toEqual(['content', 0, 'content', 0, 'type']);
	});

	it('rejects strong wrappers because bold formatting belongs on text marks', () => {
		expect(
			proseMirrorDocumentSchema.safeParse({
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [{ type: 'strong', content: [{ type: 'text', text: 'Broken' }] }]
					}
				]
			}).error?.issues[0]?.path
		).toEqual(['content', 0, 'content', 0, 'type']);
	});
});

/**
 * The producer's defaults, pinned here as well as in the editor conformance
 * spec. That one proves the editor emits them; these prove the schema accepts
 * them without needing a DOM, so a regression fails in the fastest test first.
 */
describe('attributes the editor actually writes', () => {
	it('accepts an image height stored as a number rather than a string', () => {
		expect(
			proseMirrorDocumentSchema.safeParse({
				type: 'doc',
				content: [{ type: 'image', attrs: { src: 'https://example.test/a.png', height: 80 } }]
			}).error?.issues[0]
		).toBeUndefined();
	});

	// Open by construction: any extension may add a global attribute to any node,
	// which is how `data-toc-id` arrived. Rejecting them made the schema a list of
	// every extension ever configured.
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
		const document = storedDocumentReadSchema.parse(withUnknownBlock);
		const unknown = unreadableDocumentBlocks(document)[0];
		expect({
			unknownCount: unreadableDocumentBlocks(document).length,
			keptKnownPrefix: document.content?.[0]?.type,
			reason: unknown?.reason,
			raw: unknown?.raw
		}).toEqual({
			unknownCount: 1,
			keptKnownPrefix: 'paragraph',
			reason: expect.stringContaining('compaction'),
			raw: { type: 'compaction', summary: 'from a newer editor' }
		});
	});

	// The write boundary must not accept what the read boundary tolerates:
	// `saveNote` and the importer still reject an unmodelled block outright.
	it('is still rejected at the write boundary', () => {
		expect(proseMirrorDocumentSchema.safeParse(withUnknownBlock).error?.issues[0]).toBeDefined();
	});

	it('answers with a document even when the column is not one', () => {
		const document = storedDocumentReadSchema.parse('not a document');
		expect(unreadableDocumentBlocks(document)).toMatchObject([
			{
				type: 'unknown',
				reason: expect.stringContaining('Stored document is not readable')
			}
		]);
	});
});
