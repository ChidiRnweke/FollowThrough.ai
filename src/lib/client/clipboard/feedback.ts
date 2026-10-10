import { toast } from 'svelte-sonner';
import type { ClipboardTransferReport } from '$lib/models/clipboard';
import type { ClipboardFeedback } from '$lib/models/clipboard';
export class BrowserClipboardFeedback implements ClipboardFeedback {
	report(report: ClipboardTransferReport): void {
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
	}
	error(message: string): void {
		toast.error(message);
	}
	keptSelection(changed: boolean): void {
		toast.warning(
			changed
				? 'Copied the selection, but kept it in the note because the note changed during copying.'
				: 'The selection was kept in the note because it could not be copied completely.'
		);
	}
}
