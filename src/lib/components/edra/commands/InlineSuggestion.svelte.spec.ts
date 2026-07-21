import { describe, it, expect } from 'vitest';
import { userEvent } from 'vitest/browser';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextSelection } from '@tiptap/pm/state';
import { InlineSuggestion, inlineSuggestionKey } from './InlineSuggestion';

const mountEditor = (
	fetchSuggestion: (input: unknown, signal: AbortSignal) => Promise<{ readonly text: string }>
) => {
	const element = document.createElement('div');
	document.body.append(element);
	const editor = new Editor({
		element,
		content:
			'<p>The migration plan should account for the read-replica cutover window in detail here.</p>',
		extensions: [StarterKit, InlineSuggestion.configure({ fetchSuggestion, idleDelayMs: 5 })]
	});
	return { editor, element };
};

const moveCaret = (editor: Editor) => {
	// A caret at a word boundary well inside the paragraph, which is where the
	// trigger policy permits a suggestion.
	editor.view.focus();
	const position = editor.state.doc.content.size - 1;
	editor.view.dispatch(
		editor.state.tr.setSelection(TextSelection.create(editor.state.doc, position))
	);
};

const typeAtCaret = async (editor: Editor) => {
	moveCaret(editor);
	await userEvent.keyboard(' ');
};

const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForOffer = async (editor: Editor) => {
	for (let attempt = 0; attempt < 25; attempt++) {
		if (inlineSuggestionKey.getState(editor.state)) return;
		await settle(20);
	}
};

describe('InlineSuggestion extension', () => {
	it('requests a suggestion after real contenteditable typing', async () => {
		let calls = 0;
		const { editor } = mountEditor(async () => {
			calls++;
			return { text: ' to avoid data loss.' };
		});
		moveCaret(editor);
		await userEvent.keyboard(' ');
		await settle(100);
		editor.destroy();
		expect(calls).toBe(1);
	});

	it('does not request a suggestion for a caret move without an edit', async () => {
		let calls = 0;
		const { editor } = mountEditor(async () => {
			calls++;
			return { text: ' to avoid data loss.' };
		});
		moveCaret(editor);
		await settle(100);
		editor.destroy();
		expect(calls).toBe(0);
	});

	it('renders ghost text after the caret rests', async () => {
		const { editor, element } = mountEditor(async () => ({ text: ' to avoid data loss.' }));
		await typeAtCaret(editor);
		await waitForOffer(editor);
		const ghost = element.querySelector('.inline-suggestion');
		editor.destroy();
		expect(ghost?.textContent).toContain('to avoid data loss.');
	});

	it('inserts the suggestion on Tab and clears the ghost text', async () => {
		const { editor, element } = mountEditor(async () => ({ text: ' to avoid data loss.' }));
		await typeAtCaret(editor);
		await waitForOffer(editor);
		editor.view.dom.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
		);
		const state = inlineSuggestionKey.getState(editor.state);
		const text = editor.getText();
		const ghost = element.querySelector('.inline-suggestion');
		editor.destroy();
		expect({
			hasGhost: ghost !== null,
			offered: state,
			includesText: text.includes('avoid data loss')
		}).toEqual({
			hasGhost: false,
			offered: null,
			includesText: true
		});
	});

	it('inserts the suggestion when the ghost text is clicked', async () => {
		const { editor, element } = mountEditor(async () => ({ text: ' to avoid data loss.' }));
		await typeAtCaret(editor);
		await waitForOffer(editor);
		const ghost = element.querySelector<HTMLElement>('.inline-suggestion');
		if (!ghost) throw new Error('Expected an inline suggestion');
		await userEvent.click(ghost);
		const result = {
			hasGhost: element.querySelector('.inline-suggestion') !== null,
			offered: inlineSuggestionKey.getState(editor.state),
			includesText: editor.getText().includes('avoid data loss'),
			focused: editor.view.hasFocus()
		};
		editor.destroy();
		expect(result).toEqual({
			hasGhost: false,
			offered: null,
			includesText: true,
			focused: true
		});
	});

	it('dismisses the ghost text on Escape without inserting', async () => {
		const { editor, element } = mountEditor(async () => ({ text: ' to avoid data loss.' }));
		await typeAtCaret(editor);
		await waitForOffer(editor);
		editor.view.dom.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
		);
		const ghost = element.querySelector('.inline-suggestion');
		const inserted = editor.getText().includes('avoid data loss');
		editor.destroy();
		expect({ hasGhost: ghost !== null, inserted }).toEqual({ hasGhost: false, inserted: false });
	});

	it('does not immediately offer again after Escape', async () => {
		let calls = 0;
		const { editor } = mountEditor(async () => {
			calls++;
			return { text: ' to avoid data loss.' };
		});
		await typeAtCaret(editor);
		await waitForOffer(editor);
		editor.view.dom.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
		);
		await settle(100);
		editor.destroy();
		expect(calls).toBe(1);
	});

	it('offers nothing when the model returns an empty string', async () => {
		const { editor, element } = mountEditor(async () => ({ text: '' }));
		await typeAtCaret(editor);
		await settle(100);
		const ghost = element.querySelector('.inline-suggestion');
		editor.destroy();
		expect(ghost).toBeNull();
	});
});
