import { describe, expect, it } from 'vitest';
import {
	KNOWN_NODE_TYPES,
	findProseMirrorDocumentIssue,
	parseProseMirrorDocument,
	type ProseMirrorDocument
} from '$lib/models/notes';
import { noteContentFromMarkdown, noteMarkdownFromContent } from './markdown';

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
 * Dollar signs are far more often money than mathematics.
 *
 * The Markdown extension ships a tokenizer that reads a single `$…$` as inline math, so
 * "$4–13 vs $30 per 1,000 pages" parsed into a math node holding "4–13 vs" — the text
 * vanished from the note and from the plain text the search index is built on, and KaTeX
 * only ever complained about the en-dash. Inline math now needs `$$…$$`, which is what
 * the editor's own typing rule has always required.
 */
describe('Dollar signs in Markdown', () => {
	const priced = noteContentFromMarkdown('Costs $4–13 vs $30 per 1,000 pages');

	it('keeps a pair of prices as text rather than a formula', () => {
		expect(JSON.stringify(priced.document)).not.toContain('inlineMath');
	});

	it('keeps the priced text searchable', () => {
		expect(priced.plainText).toBe('Costs $4–13 vs $30 per 1,000 pages');
	});

	it('still reads double-delimited inline math as math', () => {
		expect(noteContentFromMarkdown('so $$x^2$$ then').document.content?.[0]).toMatchObject({
			type: 'paragraph',
			content: [{ type: 'text' }, { type: 'inlineMath', attrs: { latex: 'x^2' } }, { type: 'text' }]
		});
	});

	it('still reads a formula on its own line as block math', () => {
		expect(
			noteContentFromMarkdown('before\n\n$$x^2$$\n\nafter').document.content?.[1]
		).toMatchObject({ type: 'blockMath', attrs: { latex: 'x^2' } });
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

	it('keeps inline math delimited the way it was written', () => {
		const document = docOf({
			type: 'paragraph',
			content: [
				{ type: 'text', text: 'so ' },
				{ type: 'inlineMath', attrs: { latex: 'x^2' } }
			]
		});
		expect(roundTrip(document).content?.[0]).toMatchObject({
			content: [{ type: 'text' }, { type: 'inlineMath', attrs: { latex: 'x^2' } }]
		});
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

/**
 * A rule has no children, and the note schema says so: `horizontalRule` is declared as
 * `{ type: 'horizontalRule' }` and nothing else. The Markdown parser attaches an empty
 * `content` to every block it builds, so for five weeks every note body containing `---`
 * was rejected at the write boundary. In production the agent retried the same save six
 * times in five minutes: the rejection reached it as a raw schema error about document
 * nodes it had never authored, and no argument it could change would have helped.
 */
describe('Markdown that carries a horizontal rule', () => {
	it.each([
		['three dashes', '# Plan\n\nIntro.\n\n---\n\n## Next\n\nMore.\n'],
		['three asterisks', 'before\n\n***\n\nafter\n'],
		['three underscores', 'before\n\n___\n\nafter\n']
	])('accepts a rule written as %s', (_label, source) => {
		expect(() => noteContentFromMarkdown(source)).not.toThrow();
	});

	it('keeps the rule as a rule rather than dropping it', () => {
		expect(noteContentFromMarkdown('before\n\n---\n\nafter\n').document.content?.[1]).toStrictEqual(
			{ type: 'horizontalRule' }
		);
	});
});

/**
 * The corpus above this one grew a case per bug and had no case for a rule, so the drift
 * between the converter and the schema went unseen until it reached a user. Keying the
 * corpus to the schema's own set of node types is what stops that repeating: a node type
 * added to `KNOWN_NODE_TYPES` fails here until someone writes a fixture for it.
 */
const NODE_FIXTURES: Readonly<Record<string, unknown>> = {
	text: paragraph('plain'),
	paragraph: paragraph('plain'),
	heading: { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'H' }] },
	blockquote: { type: 'blockquote', content: [paragraph('quoted')] },
	bulletList: { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph('a')] }] },
	orderedList: { type: 'orderedList', content: [{ type: 'listItem', content: [paragraph('a')] }] },
	listItem: { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph('a')] }] },
	taskList: { type: 'taskList', content: [{ type: 'taskItem', content: [paragraph('a')] }] },
	taskItem: { type: 'taskList', content: [{ type: 'taskItem', content: [paragraph('a')] }] },
	codeBlock: {
		type: 'codeBlock',
		attrs: { language: 'ts' },
		content: [{ type: 'text', text: 'const a = 1;' }]
	},
	table: {
		type: 'table',
		content: [
			{ type: 'tableRow', content: [{ type: 'tableHeader', content: [paragraph('Name')] }] },
			{ type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph('Ada')] }] }
		]
	},
	tableRow: {
		type: 'table',
		content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph('Ada')] }] }]
	},
	tableCell: {
		type: 'table',
		content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph('Ada')] }] }]
	},
	tableHeader: {
		type: 'table',
		content: [
			{ type: 'tableRow', content: [{ type: 'tableHeader', content: [paragraph('Name')] }] }
		]
	},
	horizontalRule: { type: 'horizontalRule' },
	hardBreak: { type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'hardBreak' }] },
	image: { type: 'image', attrs: { src: '/diagram.png', alt: 'plan' } },
	video: { type: 'video', attrs: { src: '/clip.mp4' } },
	audio: { type: 'audio', attrs: { src: '/clip.mp3' } },
	iframe: { type: 'iframe', attrs: { src: 'https://example.com' } },
	mermaid: {
		type: 'mermaid',
		attrs: { width: '100%' },
		content: [{ type: 'text', text: 'graph TD' }]
	},
	drawio: { type: 'drawio', attrs: { diagramId: 'diagram-7' } },
	todoNode: { type: 'todoNode', attrs: { todoId: 'todo-3' } },
	callout: { type: 'callout', attrs: { emoji: '💡' }, content: [paragraph('mind this')] },
	blockMath: { type: 'blockMath', attrs: { latex: 'x^2' } },
	inlineMath: {
		type: 'paragraph',
		content: [
			{ type: 'text', text: 'so ' },
			{ type: 'inlineMath', attrs: { latex: 'x^2' } }
		]
	}
};

describe('Every node type the schema knows', () => {
	it('has a round-trip fixture', () => {
		expect([...KNOWN_NODE_TYPES].filter((type) => !(type in NODE_FIXTURES))).toStrictEqual([]);
	});

	it.each([...KNOWN_NODE_TYPES])('round-trips %s into a writable document', (type) => {
		expect(() => parseProseMirrorDocument(roundTrip(docOf(NODE_FIXTURES[type])))).not.toThrow();
	});
});
