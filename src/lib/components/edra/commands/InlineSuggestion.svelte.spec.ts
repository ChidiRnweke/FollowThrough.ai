import { describe, it, expect } from 'vitest';
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

const restCaretInside = (editor: Editor) => {
	// A caret at a word boundary well inside the paragraph, which is where the
	// trigger policy permits a suggestion.
	editor.commands.focus();
	const position = editor.state.doc.content.size - 1;
	editor.view.dispatch(
		editor.state.tr.setSelection(TextSelection.create(editor.state.doc, position))
	);
};

const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('InlineSuggestion extension', () => {
	it('renders ghost text after the caret rests', async () => {
		const { editor, element } = mountEditor(async () => ({ text: ' to avoid data loss.' }));
		restCaretInside(editor);
		await settle(60);
		const ghost = element.querySelector('.inline-suggestion');
		editor.destroy();
		expect(ghost?.textContent).toContain('to avoid data loss.');
	});

	it('inserts the suggestion on Tab and clears the ghost text', async () => {
		const { editor, element } = mountEditor(async () => ({ text: ' to avoid data loss.' }));
		restCaretInside(editor);
		await settle(60);
		editor.view.dom.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
		);
		const state = inlineSuggestionKey.getState(editor.state);
		const text = editor.getText();
		const ghost = element.querySelector('.inline-suggestion');
		editor.destroy();
		expect({ hasGhost: ghost !== null, offered: state, includesText: text.includes('avoid data loss') }).toEqual({
			hasGhost: false,
			offered: null,
			includesText: true
		});
	});

	it('dismisses the ghost text on Escape without inserting', async () => {
		const { editor, element } = mountEditor(async () => ({ text: ' to avoid data loss.' }));
		restCaretInside(editor);
		await settle(60);
		editor.view.dom.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
		);
		const ghost = element.querySelector('.inline-suggestion');
		const inserted = editor.getText().includes('avoid data loss');
		editor.destroy();
		expect({ hasGhost: ghost !== null, inserted }).toEqual({ hasGhost: false, inserted: false });
	});

	it('offers nothing when the model returns an empty string', async () => {
		const { editor, element } = mountEditor(async () => ({ text: '' }));
		restCaretInside(editor);
		await settle(60);
		const ghost = element.querySelector('.inline-suggestion');
		editor.destroy();
		expect(ghost).toBeNull();
	});
});
