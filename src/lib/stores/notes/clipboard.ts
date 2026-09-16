import { toast } from 'svelte-sonner';
import type { ClipboardSource, ClipboardTransferReport } from '$lib/models/clipboard';
import { ClipboardTransfer } from '$lib/controllers/notes/clipboard';
import { BrowserClipboardDocument } from '$lib/client/clipboard/document';
import { BrowserClipboardWriter } from '$lib/client/clipboard/writer';
import { readClipboardImage } from '$lib/client/clipboard/images';
import { mermaidPngBlob } from '$lib/components/edra/mermaid-export';

const transfer = new ClipboardTransfer({
	writer: new BrowserClipboardWriter(),
	document: (content) => new BrowserClipboardDocument(content),
	readImage: readClipboardImage,
	renderDiagram: (source) =>
		mermaidPngBlob(source, {
			base: document.documentElement.classList.contains('dark') ? 'dark' : 'light'
		})
});

export const noteClipboard = {
	copy(source: ClipboardSource): Promise<ClipboardTransferReport> {
		return transfer.copy(source).then((report) => {
			if (report.kind === 'failure')
				toast.error('The selection could not be copied.', { description: report.message });
			if (report.kind === 'degraded') {
				const textOnly = report.issues.some((issue) => issue.kind === 'formatting');
				toast.warning(
					textOnly
						? 'Copied text only. Formatting could not be copied.'
						: `Copied with ${report.issues.length} unavailable ${report.issues.length === 1 ? 'image or diagram' : 'images or diagrams'}.`,
					{
						description: textOnly
							? 'Only the selection’s text is on the clipboard.'
							: 'Missing media is marked in the copied content.'
					}
				);
			}
			return report;
		});
	}
};
