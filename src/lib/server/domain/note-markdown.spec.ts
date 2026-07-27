import { describe, expect, it } from 'vitest';
import { findProseMirrorDocumentIssue, type ProseMirrorDocument } from '$lib/models';
import { noteContentFromMarkdown, noteMarkdownFromContent } from './note-markdown';

const formatted = noteContentFromMarkdown(
	'# About\n\nI build **reliable systems**.\n\n- Trace failures\n- Fix root causes'
);

describe('Agent note Markdown', () => {
	it('produces a valid ProseMirror document', () => {
		expect(findProseMirrorDocumentIssue(formatted.document)).toBeUndefined();
	});

	it('preserves headings, bold text, and lists as readable plain text', () => {
		expect(formatted.plainText).toBe(
			'About\n\nI build reliable systems.\n\nTrace failures\n\nFix root causes'
		);
	});

	it('allows an empty Markdown body to clear a note', () => {
		expect(noteContentFromMarkdown('')).toEqual({
			document: { type: 'doc', content: [] },
			plainText: ''
		});
	});
});

/**
 * A note is stored as ProseMirror JSON, so every Markdown round trip is a chance to
 * lose a node the syntax has no native form for. Serializing through StarterKit alone
 * turned a diagram into an empty paragraph, which would have made every targeted edit
 * quietly destructive.
 */
const roundTrip = (document: ProseMirrorDocument): ProseMirrorDocument =>
	noteContentFromMarkdown(noteMarkdownFromContent(document)).document;

const docOf = (...content: readonly unknown[]): ProseMirrorDocument =>
	({ type: 'doc', content }) as ProseMirrorDocument;

const paragraph = (text: string) => ({
	type: 'paragraph',
	content: [{ type: 'text', text }]
});

describe('Note Markdown round trip', () => {
	it('keeps a Mermaid diagram and its source', () => {
		const document = docOf({
			type: 'mermaid',
			attrs: { width: '100%' },
			content: [{ type: 'text', text: 'graph TD\nA-->B' }]
		});
		expect(roundTrip(document).content?.[0]).toMatchObject({
			type: 'mermaid',
			content: [{ type: 'text', text: 'graph TD\nA-->B' }]
		});
	});

	it('keeps a code block distinct from a diagram', () => {
		const document = docOf({
			type: 'codeBlock',
			attrs: { language: 'ts' },
			content: [{ type: 'text', text: 'const a = 1;' }]
		});
		expect(roundTrip(document).content?.[0]).toMatchObject({ type: 'codeBlock' });
	});

	it('keeps a callout and its emoji', () => {
		const document = docOf({
			type: 'callout',
			attrs: { emoji: '🔥' },
			content: [paragraph('mind this')]
		});
		expect(roundTrip(document).content?.[0]).toMatchObject({
			type: 'callout',
			attrs: { emoji: '🔥' }
		});
	});

	it('keeps a draw.io reference', () => {
		const document = docOf({ type: 'drawio', attrs: { diagramId: 'diagram-7' } });
		expect(roundTrip(document).content?.[0]).toMatchObject({
			type: 'drawio',
			attrs: { diagramId: 'diagram-7' }
		});
	});

	it('keeps an embedded todo reference', () => {
		const document = docOf({ type: 'todoNode', attrs: { todoId: 'todo-3' } });
		expect(roundTrip(document).content?.[0]).toMatchObject({
			type: 'todoNode',
			attrs: { todoId: 'todo-3' }
		});
	});

	it('keeps a task list item and its checked state', () => {
		const document = docOf({
			type: 'taskList',
			content: [{ type: 'taskItem', attrs: { checked: true }, content: [paragraph('ship it')] }]
		});
		expect(roundTrip(document).content?.[0]).toMatchObject({ type: 'taskList' });
	});

	it('keeps a table', () => {
		const document = docOf({
			type: 'table',
			content: [
				{ type: 'tableRow', content: [{ type: 'tableHeader', content: [paragraph('Name')] }] },
				{ type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph('Ada')] }] }
			]
		});
		expect(roundTrip(document).content?.[0]).toMatchObject({ type: 'table' });
	});

	it('keeps an image source', () => {
		const document = docOf({ type: 'image', attrs: { src: '/diagram.png', alt: 'plan' } });
		expect(roundTrip(document).content?.[0]).toMatchObject({
			type: 'image',
			attrs: { src: '/diagram.png' }
		});
	});

	it('keeps a link target', () => {
		const document = docOf({
			type: 'paragraph',
			content: [
				{
					type: 'text',
					marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
					text: 'docs'
				}
			]
		});
		expect(JSON.stringify(roundTrip(document))).toContain('https://example.com');
	});

	/**
	 * A renderer that ends its block with its own blank line gets one more from the
	 * serializer, and the pair parses back as an empty paragraph that accumulates on
	 * every edit. Checking the node count around each block is what catches it.
	 */
	it.each([
		[
			'a Mermaid diagram',
			{ type: 'mermaid', attrs: { width: '100%' }, content: [{ type: 'text', text: 'graph TD' }] }
		],
		['a callout', { type: 'callout', attrs: { emoji: '💡' }, content: [paragraph('mind this')] }],
		['a draw.io reference', { type: 'drawio', attrs: { diagramId: 'diagram-7' } }],
		['a todo reference', { type: 'todoNode', attrs: { todoId: 'todo-3' } }],
		[
			'a code block',
			{ type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'a' }] }
		]
	])('inserts no blank paragraph around %s', (_label, block) => {
		const document = docOf(paragraph('before'), block, paragraph('after'));
		expect(roundTrip(document).content).toHaveLength(3);
	});

	it('drops the transient AI highlight without losing its text', () => {
		const document = docOf({
			type: 'paragraph',
			content: [{ type: 'text', marks: [{ type: 'ai-highlight' }], text: 'rewritten' }]
		});
		expect(noteMarkdownFromContent(document).trim()).toBe('rewritten');
	});
});

describe('Note links in a round trip', () => {
	const linkedDoc = docOf({
		type: 'paragraph',
		content: [
			{ type: 'text', text: 'see ' },
			{
				type: 'text',
				marks: [{ type: 'noteLink', attrs: { noteId: 'note-42' } }],
				text: 'the decision'
			}
		]
	});

	/** Without this, edit_note would strip every note link from a note it touched. */
	it('keeps the link target', () => {
		expect(JSON.stringify(roundTrip(linkedDoc))).toContain('note-42');
	});

	it('keeps the link as a note link rather than an external one', () => {
		expect(JSON.stringify(roundTrip(linkedDoc))).toContain('noteLink');
	});

	it('keeps the link text', () => {
		expect(noteMarkdownFromContent(linkedDoc)).toContain('the decision');
	});

	it('serializes to an ordinary Markdown link with a note scheme', () => {
		expect(noteMarkdownFromContent(linkedDoc)).toContain('](note:note-42)');
	});

	it('still reads an external link as an external link', () => {
		const external = docOf({
			type: 'paragraph',
			content: [
				{
					type: 'text',
					marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
					text: 'docs'
				}
			]
		});
		expect(JSON.stringify(roundTrip(external))).not.toContain('noteLink');
	});
});
