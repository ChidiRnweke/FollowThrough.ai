import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { selectionActionKey, createSelectionActionPlugin } from './selection-action-plugin';
const editors: Editor[] = [];
afterEach(() => {
	for (const editor of editors.splice(0)) {
		editor.view.dom.remove();
		editor.destroy();
	}
});
describe('selection action plugin rendered washes', () => {
	it.each([
		['running', 'selection-action-range'],
		['held', 'selection-held']
	] as const)('renders the %s selection wash on the selected text', (variant, className) => {
		const editor = new Editor({
			element: document.createElement('div'),
			extensions: [StarterKit],
			content: '<p>Hello world.</p>'
		});
		editors.push(editor);
		document.body.append(editor.view.dom);
		editor.registerPlugin(createSelectionActionPlugin());
		editor.view.dispatch(editor.state.tr.setMeta(selectionActionKey, { from: 1, to: 6, variant }));
		expect(editor.view.dom.querySelector(`.${className}`)?.textContent).toBe('Hello');
	});
});
