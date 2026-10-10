import { expect, it } from 'vitest';
import { createEditor } from './editor';
import type { Editor } from './CoreEditor';
it('inserts the completed attachment URL after an image paste without replacing surrounding text', async () => {
	const host = document.createElement('div');
	const element = document.createElement('div');
	host.append(element);
	document.body.append(host);
	let mounted: Editor | undefined;
	const uploaded: string[] = [];
	const dispose = $effect.root(() => {
		mounted = createEditor({
			onFileUpload: async (file) => {
				uploaded.push(file.name);
				return '/api/attachments/11111111-1111-4111-8111-111111111111/content';
			}
		});
	});
	if (!mounted) throw new Error('Editor did not mount');
	const editor = mounted;
	try {
		editor.setOptions({ element });
		editor.commands.setContent('<p>Keep this passage</p>');
		editor.commands.focus('end');
		const clipboardData = new DataTransfer();
		clipboardData.items.add(
			new File(
				[
					Uint8Array.from(
						atob(
							'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
						),
						(character) => character.charCodeAt(0)
					)
				],
				'example.png',
				{ type: 'image/png' }
			)
		);
		editor.view.dom.dispatchEvent(
			new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true })
		);
		await expect
			.poll(() => ({
				text: editor.state.doc.textContent,
				uploaded,
				sources: [...editor.view.dom.querySelectorAll('img')].map((image) =>
					image.getAttribute('src')
				)
			}))
			.toEqual({
				text: 'Keep this passage',
				uploaded: ['example.png'],
				sources: ['/api/attachments/11111111-1111-4111-8111-111111111111/content']
			});
	} finally {
		dispose();
		host.remove();
	}
});
