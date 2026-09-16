import { describe, expect, it } from 'vitest';
import type { ProseMirrorDocument } from '$lib/models/notes';
import { collectNoteLinkTargets, documentReferencesAttachment } from './index';

const linked = (noteId: string, text = 'the decision') => ({
	type: 'text',
	marks: [{ type: 'noteLink', attrs: { noteId } }],
	text
});

const doc = (...content: unknown[]): ProseMirrorDocument =>
	({ type: 'doc', content }) as ProseMirrorDocument;

describe('Finding the notes a document links to', () => {
	it('finds a link in a paragraph', () => {
		expect(collectNoteLinkTargets(doc({ type: 'paragraph', content: [linked('a')] }))).toEqual([
			'a'
		]);
	});

	it('finds a link nested inside a list', () => {
		const document = doc({
			type: 'bulletList',
			content: [
				{
					type: 'listItem',
					content: [{ type: 'paragraph', content: [linked('deep')] }]
				}
			]
		});
		expect(collectNoteLinkTargets(document)).toEqual(['deep']);
	});

	/** Two links to the same note are one relationship, not two rows. */
	it('reports a repeated target once', () => {
		const document = doc({ type: 'paragraph', content: [linked('a'), linked('a', 'again')] });
		expect(collectNoteLinkTargets(document)).toEqual(['a']);
	});

	it('keeps distinct targets in document order', () => {
		const document = doc({ type: 'paragraph', content: [linked('first'), linked('second')] });
		expect(collectNoteLinkTargets(document)).toEqual(['first', 'second']);
	});

	it('ignores an external link', () => {
		const document = doc({
			type: 'paragraph',
			content: [
				{ type: 'text', marks: [{ type: 'link', attrs: { href: 'https://x.com' } }], text: 'x' }
			]
		});
		expect(collectNoteLinkTargets(document)).toEqual([]);
	});

	it('ignores a link mark with no target', () => {
		const document = doc({
			type: 'paragraph',
			content: [{ type: 'text', marks: [{ type: 'noteLink', attrs: {} }], text: 'x' }]
		});
		expect(collectNoteLinkTargets(document)).toEqual([]);
	});

	it('finds nothing in an empty document', () => {
		expect(collectNoteLinkTargets(doc())).toEqual([]);
	});
});

describe('Finding an embedded attachment in a note document', () => {
	it('finds the exact attachment in a nested image node', () => {
		const document = doc({
			type: 'blockquote',
			content: [
				{
					type: 'image',
					attrs: { src: '/api/attachments/attachment-7/content' }
				}
			]
		});
		expect(documentReferencesAttachment(document, 'attachment-7')).toBe(true);
	});

	it('does not treat the same url in prose as an embedded image', () => {
		const document = doc({
			type: 'paragraph',
			content: [{ type: 'text', text: '/api/attachments/attachment-7/content' }]
		});
		expect(documentReferencesAttachment(document, 'attachment-7')).toBe(false);
	});
});
