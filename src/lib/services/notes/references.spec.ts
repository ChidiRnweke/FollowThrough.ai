import { describe, expect, it } from 'vitest';
import type { ProseMirrorDocument, ProseMirrorNode, ProseMirrorTextNode } from '$lib/models/notes';
import { NoteReferenceService } from '$lib/services/notes/references';
const noteReferences = new NoteReferenceService();

const linked = (noteId: string, text = 'the decision'): ProseMirrorTextNode => ({
	type: 'text',
	marks: [{ type: 'noteLink', attrs: { noteId } }],
	text
});

const doc = (...content: ProseMirrorNode[]): ProseMirrorDocument => ({ type: 'doc', content });

describe('Finding the notes a document links to', () => {
	it('finds a link in a paragraph', () => {
		expect(noteReferences.links(doc({ type: 'paragraph', content: [linked('a')] }))).toEqual(['a']);
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
		expect(noteReferences.links(document)).toEqual(['deep']);
	});

	/** Two links to the same note are one relationship, not two rows. */
	it('reports a repeated target once', () => {
		const document = doc({ type: 'paragraph', content: [linked('a'), linked('a', 'again')] });
		expect(noteReferences.links(document)).toEqual(['a']);
	});

	it('keeps distinct targets in document order', () => {
		const document = doc({ type: 'paragraph', content: [linked('first'), linked('second')] });
		expect(noteReferences.links(document)).toEqual(['first', 'second']);
	});

	it('ignores an external link', () => {
		const document = doc({
			type: 'paragraph',
			content: [
				{ type: 'text', marks: [{ type: 'link', attrs: { href: 'https://x.com' } }], text: 'x' }
			]
		});
		expect(noteReferences.links(document)).toEqual([]);
	});

	it('ignores a link mark with no target', () => {
		const document = doc({
			type: 'paragraph',
			content: [{ type: 'text', marks: [{ type: 'noteLink', attrs: {} }], text: 'x' }]
		});
		expect(noteReferences.links(document)).toEqual([]);
	});

	it('finds nothing in an empty document', () => {
		expect(noteReferences.links(doc())).toEqual([]);
	});
});

describe('note diagram references', () => {
	it('finds nested diagram references in document order', () => {
		expect(
			noteReferences.diagrams([
				{
					document: {
						type: 'doc',
						content: [
							{ type: 'blockquote', content: [{ type: 'drawio', attrs: { diagramId: 'first' } }] },
							{ type: 'drawio', attrs: { diagramId: 'second' } }
						]
					}
				}
			])
		).toEqual(['first', 'second']);
	});
	it('counts a repeated diagram once across the selected documents', () => {
		expect(
			noteReferences.diagrams([
				{ document: { type: 'doc', content: [{ type: 'drawio', attrs: { diagramId: 'same' } }] } },
				{ document: { type: 'doc', content: [{ type: 'drawio', attrs: { diagramId: 'same' } }] } }
			])
		).toEqual(['same']);
	});
	it('ignores empty references retained in a document', () => {
		expect(
			noteReferences.diagrams([
				{
					document: {
						type: 'doc',
						content: [{ type: 'drawio' }, { type: 'drawio', attrs: { diagramId: null } }]
					}
				}
			])
		).toEqual([]);
	});
});
