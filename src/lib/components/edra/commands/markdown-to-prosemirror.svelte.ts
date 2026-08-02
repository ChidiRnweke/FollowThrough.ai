import { createEditor } from '$lib/components/edra/commands/editor';
import type { EdraDocument } from './document.js';

export async function markdownToProseMirror(markdown: string): Promise<{
	document: EdraDocument;
	plainText: string;
}> {
	return new Promise((resolve, reject) => {
		const container = document.createElement('div');
		container.style.position = 'absolute';
		container.style.left = '-9999px';
		container.style.top = '-9999px';
		container.style.width = '1px';
		container.style.height = '1px';
		container.style.overflow = 'hidden';
		container.style.opacity = '0';
		document.body.appendChild(container);

		const editor = createEditor({}, []);

		if (!editor) {
			container.remove();
			reject(new Error('Failed to create editor'));
			return;
		}

		editor.commands.setContent(markdown);
		const json = editor.getJSON() as unknown as EdraDocument;
		const text = editor.getText({ blockSeparator: '\n\n' });
		editor.destroy();
		container.remove();
		resolve({ document: json, plainText: text });
	});
}
