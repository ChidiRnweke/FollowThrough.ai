import type { RichClipboardContent } from '$lib/models/clipboard';

const handled = <T>(promise: Promise<T>): Promise<T> => {
	// audit-allow: silent-catch — ClipboardItem.write reports this rejection; observe it even if permission rejection prevents the native API from consuming a pending blob.
	promise.catch(() => {});
	return promise;
};

/** Native writes start synchronously with unresolved blobs, preserving browser user activation. */
export class BrowserClipboardWriter {
	writeRich(content: Promise<RichClipboardContent>): Promise<void> {
		const html = handled(content.then(({ html }) => new Blob([html], { type: 'text/html' })));
		const text = handled(content.then(({ text }) => new Blob([text], { type: 'text/plain' })));
		return navigator.clipboard.write([
			new ClipboardItem({
				'text/html': html,
				'text/plain': text
			})
		]);
	}
	writeImage(image: Promise<Blob>, text: string): Promise<void> {
		const png = handled(image);
		return navigator.clipboard.write([
			new ClipboardItem({
				'image/png': png,
				'text/plain': new Blob([text], { type: 'text/plain' })
			})
		]);
	}
	writeText(text: string): Promise<void> {
		return navigator.clipboard.writeText(text);
	}
}
