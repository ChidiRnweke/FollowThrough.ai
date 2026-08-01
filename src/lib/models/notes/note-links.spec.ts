import { describe, expect, it } from 'vitest';
import type { NoteId, ProseMirrorDocument } from '$lib/models/notes';
import { collectNoteLinkTargets, resolveWikiLinks } from './index';

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

describe('Resolving imported wiki links', () => {
	const titles = new Map<string, NoteId>([['design review', 'note-7' as NoteId]]);

	it('rewrites a matched link to a note link', () => {
		expect(resolveWikiLinks('see [[Design Review]]', titles)).toBe(
			'see [Design Review](note:note-7)'
		);
	});

	it('matches regardless of case', () => {
		expect(resolveWikiLinks('[[design review]]', titles)).toContain('note:note-7');
	});

	it('keeps the shown text of a piped link', () => {
		expect(resolveWikiLinks('[[Design Review|the review]]', titles)).toBe(
			'[the review](note:note-7)'
		);
	});

	/** A dead link would be worse than text that still says what was meant. */
	it('leaves an unresolved link as written', () => {
		expect(resolveWikiLinks('see [[Missing Note]]', titles)).toBe('see [[Missing Note]]');
	});

	it('leaves ordinary prose untouched', () => {
		expect(resolveWikiLinks('an array[[0]] index', titles)).toBe('an array[[0]] index');
	});

	it('rewrites every match in a body', () => {
		expect(resolveWikiLinks('[[Design Review]] and [[Design Review]]', titles)).toBe(
			'[Design Review](note:note-7) and [Design Review](note:note-7)'
		);
	});
});
