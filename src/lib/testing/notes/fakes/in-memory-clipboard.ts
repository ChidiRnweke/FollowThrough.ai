import type { RichClipboardContent, ClipboardWriter } from '$lib/models/clipboard';

export class InMemoryClipboard implements ClipboardWriter {
	value:
		| { kind: 'empty' }
		| { kind: 'rich'; content: RichClipboardContent }
		| { kind: 'image'; image: Blob; text: string }
		| { kind: 'text'; text: string } = { kind: 'empty' };
	pending: Promise<void> = Promise.resolve();
	activation = true;
	fail = new Set<'rich' | 'image' | 'text'>();
	async writeRich(content: Promise<RichClipboardContent>): Promise<void> {
		if (!this.activation) throw new Error('Clipboard user activation expired');
		const resolved = await content;
		await this.pending;
		if (this.fail.has('rich')) throw new Error('Formatted clipboard writes are unavailable');
		this.value = { kind: 'rich', content: resolved };
	}
	async writeImage(image: Promise<Blob>, text: string): Promise<void> {
		if (!this.activation) throw new Error('Clipboard user activation expired');
		const resolved = await image;
		await this.pending;
		if (this.fail.has('image')) throw new Error('Image clipboard writes are unavailable');
		this.value = { kind: 'image', image: resolved, text };
	}
	async writeText(text: string): Promise<void> {
		if (!this.activation) throw new Error('Clipboard user activation expired');
		await this.pending;
		if (this.fail.has('text')) throw new Error('Clipboard permission was denied');
		this.value = { kind: 'text', text };
	}
}
