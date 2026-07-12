import type { EditorOptions } from '@tiptap/core';

import { Editor } from './CoreEditor.js';

export const useEditor = (options: Partial<EditorOptions> = {}) => {
	let editor: Editor | undefined = undefined;

	if (typeof window !== 'undefined') {
		editor = new Editor(options);
	}

	$effect(() => {
		return () => {
			if (editor) {
				const nodes = editor.view.dom?.parentNode;
				const newEl = nodes?.cloneNode(true) as HTMLElement;
				nodes?.parentNode?.replaceChild(newEl, nodes);
				editor.destroy();
			}
		};
	});

	return editor;
};
