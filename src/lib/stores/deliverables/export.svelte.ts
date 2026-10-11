import type { ExportDownload } from '$lib/models/deliverables';

/** A mounted export dialog owns its generation, progress and preview URL. */
export class DocumentExportStore {
	private revision = 0;
	private working = $state(false);
	private failure = $state('');
	private download = $state<ExportDownload | null>(null);
	private preview = $state('');
	get generation(): number {
		return this.revision;
	}
	get busy(): boolean {
		return this.working;
	}
	get error(): string {
		return this.failure;
	}
	get result(): ExportDownload | null {
		return this.download;
	}
	get previewUrl(): string {
		return this.preview;
	}
	open(): number {
		this.revision += 1;
		this.working = false;
		this.failure = '';
		this.download = null;
		return this.revision;
	}
	begin(): void {
		this.working = true;
		this.failure = '';
	}
	finish(): void {
		this.working = false;
	}
	fail(message: string): void {
		this.failure = message;
	}
	publish(result: ExportDownload): void {
		this.download = result;
	}
	showPreview(url: string): void {
		this.preview = url;
	}
	close(): void {
		this.revision += 1;
		this.working = false;
		this.preview = '';
	}
}
