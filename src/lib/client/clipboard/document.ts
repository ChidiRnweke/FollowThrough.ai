import type { ClipboardAsset, RichClipboardContent } from '$lib/models/clipboard';

const dataUri = (blob: Blob): Promise<string> =>
	new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () =>
			typeof reader.result === 'string'
				? resolve(reader.result)
				: reject(new Error('The image could not be encoded'));
		reader.onerror = () => reject(reader.error ?? new Error('The image could not be read'));
		reader.readAsDataURL(blob);
	});

/** Browser serialization adapter. Every media element has an explicit replacement outcome. */
export class BrowserClipboardDocument {
	readonly assets: readonly ClipboardAsset[];
	private readonly container = document.createElement('div');
	private readonly elements = new Map<string, Element>();
	private readonly missing: string[] = [];
	constructor(private readonly original: RichClipboardContent) {
		this.container.innerHTML = original.html;
		this.assets = Array.from(this.container.querySelectorAll('div[data-type="mermaid"], img')).map(
			(element, index) => {
				const id = String(index);
				this.elements.set(id, element);
				return element.tagName === 'IMG'
					? { id, kind: 'image', source: element.getAttribute('src') ?? '' }
					: { id, kind: 'diagram', source: element.textContent ?? '' };
			}
		);
	}
	async embed(id: string, blob: Blob): Promise<void> {
		const element = this.element(id);
		const image = document.createElement('img');
		image.src = await dataUri(blob);
		for (const name of ['alt', 'width', 'height', 'style']) {
			const value = element.getAttribute(name);
			if (value !== null) image.setAttribute(name, value);
		}
		const width = element.getAttribute('data-width');
		if (width) image.style.width = width;
		element.replaceWith(image);
	}
	markUnavailable(id: string): void {
		const element = this.element(id);
		const message = element.tagName === 'IMG' ? '[Image unavailable]' : '[Diagram unavailable]';
		const placeholder = document.createElement('span');
		placeholder.textContent = message;
		element.replaceWith(placeholder);
		this.missing.push(message);
	}
	content(): RichClipboardContent {
		return {
			html: this.container.innerHTML,
			text: [this.original.text, ...this.missing].filter(Boolean).join('\n')
		};
	}
	private element(id: string): Element {
		const element = this.elements.get(id);
		if (!element) throw new Error('The clipboard media identity was not found');
		return element;
	}
}
