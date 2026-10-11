import { describe, expect, it } from 'vitest';
import { createEditor } from './editor';
import type { Editor } from './CoreEditor';

/**
 * The acceptance test for clipboard padding: a real editor, a real paste event.
 *
 * The unit tests cover the slice transform in isolation, but the bug lived in whether the
 * transform is reached at all — a paste that `handlePaste` claims never sees
 * `transformPasted`. Only a paste dispatched at a mounted editor answers that.
 */

/** The paragraph from the note this was reported against, with no padding of its own. */
const paragraph = {
	type: 'doc',
	content: [
		{
			type: 'paragraph',
			content: [
				{ type: 'text', text: 'The core principle: ' },
				{ type: 'text', marks: [{ type: 'bold' }], text: 'governed configuration.' },
				{ type: 'text', text: ' Every layer is replaceable.' }
			]
		}
	]
};

const mount = (): Editor => {
	const element = document.createElement('div');
	document.body.appendChild(element);
	let created: Editor | undefined;
	$effect.root(() => {
		created = createEditor();
	});
	const editor = created!;
	editor.setOptions({ element });
	editor.commands.setContent(paragraph);
	return editor;
};

/** Paste `html`/`text` with the caret at the end of the document. */
const pasteInto = (editor: Editor, html: string, text: string): string => {
	editor.commands.focus('end');
	const data = new DataTransfer();
	data.setData('text/plain', text);
	if (html) data.setData('text/html', html);
	editor.view.dom.dispatchEvent(
		new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
	);
	return JSON.stringify(editor.getJSON());
};

const TEXT = 'The core principle: Every layer is replaceable.';
const RESULT_TEXT =
	'The core principle: governed configuration. Every layer is replaceable.' + TEXT;
const pastedResult = (editor: Editor) => {
	let hardBreaks = 0;
	editor.state.doc.descendants((node) => {
		if (node.type.name === 'hardBreak') hardBreaks += 1;
	});
	return {
		text: editor.state.doc.textContent,
		blocks: editor.state.doc.content.content.map((block) => ({
			type: block.type.name,
			text: block.textContent
		})),
		containsPastedText: editor.state.doc.textContent.includes(TEXT),
		hardBreaks,
		emptyParagraphs: editor.state.doc.content.content.filter(
			(block) => block.type.name === 'paragraph' && block.textContent.length === 0
		).length
	};
};

describe('Pasting into a mounted editor', () => {
	it('adds no line break when the clipboard pads the text with blank paragraphs', () => {
		const editor = mount();
		pasteInto(editor, `<p><br><br></p><p>${TEXT}</p><p><br><br></p>`, `\n\n${TEXT}\n\n`);
		const result = pastedResult(editor);
		editor.destroy();

		expect(result).toEqual({
			text: RESULT_TEXT,
			blocks: [{ type: 'paragraph', text: RESULT_TEXT }],
			containsPastedText: true,
			hardBreaks: 0,
			emptyParagraphs: 0
		});
	});

	it('adds no line break when the clipboard is a copy out of this editor', () => {
		const editor = mount();
		pasteInto(editor, `<p data-pm-slice="1 1 []">${TEXT}<br><br></p>`, `${TEXT}\n\n`);
		const result = pastedResult(editor);
		editor.destroy();

		expect(result).toEqual({
			text: RESULT_TEXT,
			blocks: [{ type: 'paragraph', text: RESULT_TEXT }],
			containsPastedText: true,
			hardBreaks: 0,
			emptyParagraphs: 0
		});
	});

	it('adds no line break when the clipboard is plain Markdown', () => {
		const editor = mount();
		pasteInto(editor, '', `\n\n${TEXT}\n\n`);
		const result = pastedResult(editor);
		editor.destroy();

		expect(result).toEqual({
			text: RESULT_TEXT,
			blocks: [{ type: 'paragraph', text: RESULT_TEXT }],
			containsPastedText: true,
			hardBreaks: 0,
			emptyParagraphs: 0
		});
	});

	it('keeps a line break the clipboard puts between two runs of text', () => {
		const editor = mount();
		const pasted = pasteInto(editor, '<p>one<br>two</p>', 'one\ntwo');
		editor.destroy();

		expect(pasted).toContain('hardBreak');
	});
});

describe('Pasting a copied paragraph at a caret inside another paragraph', () => {
	/** The slice shape captured from the running app: closed, one paragraph, padded. */
	const CLOSED = '<p><br><br></p><p>Frontend </p><p><br><br></p>';

	it('merges into the paragraph at the caret instead of starting a new block', () => {
		const editor = mount();
		pasteInto(editor, CLOSED, 'Frontend ');
		const blocks = editor.getJSON().content!.length;
		const first = editor.getJSON().content![0];
		editor.destroy();

		expect(blocks).toBe(1);
		expect(JSON.stringify(first)).toContain('Frontend');
	});

	it('keeps a copied heading a block of its own, rather than dissolving it', () => {
		const editor = mount();
		// Closed, the way a whole-block copy out of this editor arrives.
		pasteInto(editor, '<h2 data-pm-slice="0 0 []">Frontend</h2>', 'Frontend');
		const types = editor.getJSON().content!.map((b) => b.type);
		editor.destroy();

		expect(types).toContain('heading');
	});
});

describe('Copying out of a mounted editor', () => {
	it('puts no trailing line break on the clipboard', () => {
		const editor = mount();
		editor.commands.setContent({
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [{ type: 'text', text: TEXT }, { type: 'hardBreak' }, { type: 'hardBreak' }]
				}
			]
		});
		editor.commands.selectAll();
		const data = new DataTransfer();
		editor.view.dom.dispatchEvent(
			new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true })
		);
		const html = data.getData('text/html');
		const copied = document.createElement('div');
		copied.innerHTML = html;
		editor.destroy();

		expect({
			text: copied.textContent,
			breaks: copied.querySelectorAll('br').length
		}).toEqual({ text: TEXT, breaks: 0 });
	});
});

/** An empty note, so a paste is the only content and replaces the empty paragraph. */
const mountEmpty = (): Editor => {
	const editor = mount();
	editor.commands.setContent({ type: 'doc', content: [{ type: 'paragraph' }] });
	return editor;
};

/** Block types, ignoring the empty paragraph the caret started in and a block paste leaves behind. */
const blockTypes = (editor: Editor): string[] =>
	editor.state.doc.content.content
		.filter((block) => block.type.name !== 'paragraph' || block.textContent !== '')
		.map((block) => block.type.name);

/** Every block's text, including empty ones, so a stray blank block would show. */
const blockTexts = (editor: Editor): string[] =>
	editor.state.doc.content.content.map((block) => block.textContent);

const markNames = (editor: Editor): string[] => {
	const names = new Set<string>();
	editor.state.doc.descendants((node) => {
		for (const mark of node.marks) names.add(mark.type.name);
	});
	return [...names];
};

/** Everything in the document that is not a plain paragraph of unmarked text. */
const structure = (editor: Editor): string[] => {
	const found = new Set<string>();
	editor.state.doc.descendants((node) => {
		if (!['paragraph', 'text', 'hardBreak'].includes(node.type.name)) found.add(node.type.name);
		for (const mark of node.marks) found.add(mark.type.name);
	});
	return [...found];
};

describe('Pasting plain text that is secretly Markdown', () => {
	it.each([
		['a heading', '# Release notes', 'heading'],
		['a bullet list', '- one\n- two', 'bulletList'],
		['a numbered list', '1. first\n2. second', 'orderedList'],
		['a blockquote', '> quoted', 'blockquote'],
		['a fenced code block', '```ts\nconst a = 1;\n```', 'codeBlock'],
		['a table', '| Name | Role |\n| --- | --- |\n| Ada | Dev |', 'table']
	])('turns %s into a block', (_label, text, block) => {
		const editor = mountEmpty();
		pasteInto(editor, '', text);
		const types = blockTypes(editor);
		editor.destroy();

		expect(types).toEqual([block]);
	});

	it.each([
		['a link', 'see [the docs](https://example.com)', 'link'],
		['bold text', 'this is **important**', 'bold'],
		['inline code', 'run `pnpm check`', 'code']
	])('turns %s into inline formatting', (_label, text, mark) => {
		const editor = mountEmpty();
		pasteInto(editor, '', text);
		const marks = markNames(editor);
		editor.destroy();

		expect(marks).toEqual([mark]);
	});

	it('splits several paragraphs of prose into paragraphs', () => {
		const editor = mountEmpty();
		pasteInto(editor, '', 'First thought.\n\nSecond thought.');
		const types = blockTypes(editor);
		editor.destroy();

		expect(types).toEqual(['paragraph', 'paragraph']);
	});

	it.each([
		['a bare sentence', 'Just a sentence I copied.'],
		['a single wrapped line', 'one line\nand its continuation'],
		['a hyphen mid-sentence', 'a well-known problem']
	])('inserts %s as it is', (_label, text) => {
		const editor = mountEmpty();
		pasteInto(editor, '', text);
		const found = structure(editor);
		editor.destroy();

		expect(found).toEqual([]);
	});

	/**
	 * Pricing pasted out of a spreadsheet or a chat used to lose its first figure: the
	 * Markdown extension read `$4–13 vs $` as inline math and dropped the text.
	 */
	it('keeps every price in pasted prose', () => {
		const editor = mountEmpty();
		pasteInto(editor, '', 'Costs $4–13 vs $30 per 1,000 pages.\n\nStill worth it.');
		const paragraphs = blockTexts(editor);
		editor.destroy();

		expect(paragraphs).toEqual(['Costs $4–13 vs $30 per 1,000 pages.', 'Still worth it.']);
	});

	it('does not create blank blocks around padded paragraphs', () => {
		const editor = mountEmpty();
		pasteInto(editor, '', '\n\nFirst thought.\n\nSecond thought.\n\n');
		const paragraphs = blockTexts(editor);
		editor.destroy();

		expect(paragraphs).toEqual(['First thought.', 'Second thought.']);
	});
});

describe('Pasting Markdown that arrives with a text/html flavour', () => {
	it('parses a VS Code copy, whose styled div tree carries no structure', () => {
		const editor = mountEmpty();
		pasteInto(
			editor,
			'<div style="color:#d4d4d4;white-space:pre;"><div><span style="color:#569cd6;"># Release notes</span></div><div><span>- one</span></div></div>',
			'# Release notes\n- one'
		);
		const types = blockTypes(editor);
		editor.destroy();

		expect(types).toEqual(['heading', 'bulletList']);
	});

	it('parses a terminal copy wrapped in pre', () => {
		const editor = mountEmpty();
		pasteInto(editor, '<pre style="font-family:monospace">- one\n- two</pre>', '- one\n- two');
		const types = blockTypes(editor);
		editor.destroy();

		expect(types).toEqual(['bulletList']);
	});

	it('keeps the formatting of real rich content instead of re-parsing its text', () => {
		const editor = mountEmpty();
		pasteInto(editor, '<p>see <strong>this</strong></p>', '# not a heading');
		const pasted = { blocks: blockTypes(editor), text: editor.state.doc.textContent };
		editor.destroy();

		expect(pasted).toEqual({ blocks: ['paragraph'], text: 'see this' });
	});

	it('keeps a copy out of this editor as it was, even when its text looks like Markdown', () => {
		const editor = mountEmpty();
		pasteInto(
			editor,
			'<div data-pm-slice="1 1 []"><p># not a heading</p></div>',
			'# not a heading'
		);
		const pasted = { blocks: blockTypes(editor), text: editor.state.doc.textContent };
		editor.destroy();

		expect(pasted).toEqual({ blocks: ['paragraph'], text: '# not a heading' });
	});
});

describe('Pasting with the literal-paste shortcut', () => {
	const press = (editor: Editor, init: KeyboardEventInit) =>
		editor.view.dom.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
		);

	it('inserts Markdown as typed characters after ctrl+shift+V', () => {
		const editor = mountEmpty();
		press(editor, { key: 'V', ctrlKey: true, shiftKey: true });
		pasteInto(editor, '', '# Release notes');
		const pasted = { blocks: blockTypes(editor), text: editor.state.doc.textContent };
		editor.destroy();

		expect(pasted).toEqual({ blocks: ['paragraph'], text: '# Release notes' });
	});

	it('inserts Markdown as typed characters after cmd+shift+v', () => {
		const editor = mountEmpty();
		press(editor, { key: 'v', metaKey: true, shiftKey: true });
		pasteInto(editor, '', '# Release notes');
		const types = blockTypes(editor);
		editor.destroy();

		expect(types).toEqual(['paragraph']);
	});

	it('still parses Markdown after an ordinary ctrl+v', () => {
		const editor = mountEmpty();
		press(editor, { key: 'v', ctrlKey: true });
		pasteInto(editor, '', '# Release notes');
		const types = blockTypes(editor);
		editor.destroy();

		expect(types).toEqual(['heading']);
	});

	it('still parses Markdown after another shifted shortcut', () => {
		const editor = mountEmpty();
		press(editor, { key: 'p', ctrlKey: true, shiftKey: true });
		pasteInto(editor, '', '# Release notes');
		const types = blockTypes(editor);
		editor.destroy();

		expect(types).toEqual(['heading']);
	});
});
