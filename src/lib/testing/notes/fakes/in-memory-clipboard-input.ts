import type {
	ClipboardFeedback,
	ClipboardReader
} from '$lib/controllers/notes/clipboard-operations';
import type { ClipboardPaste } from '$lib/models/browser-workspace';
import type { ClipboardTransferReport } from '$lib/models/clipboard';
export class InMemoryClipboardInput implements ClipboardReader, ClipboardFeedback {
	content: ClipboardPaste = { kind: 'text', text: 'replacement' };
	failure = false;
	pending: Promise<void> = Promise.resolve();
	readonly errors: string[] = [];
	readonly reports: ClipboardTransferReport[] = [];
	readonly kept: boolean[] = [];
	async read(): Promise<ClipboardPaste> {
		await this.pending;
		if (this.failure) throw new Error('Permission denied');
		return this.content;
	}
	error(message: string): void {
		this.errors.push(message);
	}
	report(report: ClipboardTransferReport): void {
		this.reports.push(report);
	}
	keptSelection(changed: boolean): void {
		this.kept.push(changed);
	}
}
