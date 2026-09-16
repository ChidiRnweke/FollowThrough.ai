import type { RichClipboardContent } from '$lib/models/clipboard';
import type { ClipboardWriter } from '$lib/controllers/notes/clipboard';

export class InMemoryClipboard implements ClipboardWriter {
	value:
		| { kind: 'empty' }
		| { kind: 'rich'; content: RichClipboardContent }
		| { kind: 'image'; image: Blob; text: string }
		| { kind: 'text'; text: string } = { kind: 'empty' };
	fail = new Set<'rich' | 'image' | 'text'>();
	async writeRich(content: Promise<RichClipboardContent>): Promise<void> {
		const resolved = await content;
		if (this.fail.has('rich')) throw new Error('Formatted clipboard writes are unavailable');
		this.value = { kind: 'rich', content: resolved };
	}
	async writeImage(image: Promise<Blob>, text: string): Promise<void> {
		const resolved = await image;
		if (this.fail.has('image')) throw new Error('Image clipboard writes are unavailable');
		this.value = { kind: 'image', image: resolved, text };
	}
	async writeText(text: string): Promise<void> {
		if (this.fail.has('text')) throw new Error('Clipboard permission was denied');
		this.value = { kind: 'text', text };
	}
}
