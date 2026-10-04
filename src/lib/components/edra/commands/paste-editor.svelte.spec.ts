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
		editor.destroy();

		expect(blocks).toBe(1);
	});

	it('lands the text in the paragraph the caret was in', () => {
		const editor = mount();
		pasteInto(editor, CLOSED, 'Frontend ');
		const first = editor.getJSON().content![0];
		editor.destroy();

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
