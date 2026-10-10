import type { ClipboardReader } from '$lib/controllers/notes/clipboard-operations';
import type { ClipboardPaste } from '$lib/models/browser-workspace';
export class BrowserClipboardReader implements ClipboardReader {
	async read(format: 'raw' | 'formatted'): Promise<ClipboardPaste> {
		if (format === 'formatted') {
			const item = (await navigator.clipboard.read()).find((item) =>
				item.types.includes('text/html')
			);
			if (item) return { kind: 'html', text: await (await item.getType('text/html')).text() };
		}
		return { kind: 'text', text: await navigator.clipboard.readText() };
	}
}
