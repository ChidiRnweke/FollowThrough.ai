import type { DeliverableBinding } from '$lib/models/browser-deliverables';
import type { NoteDocument } from '$lib/models/notes';
import type { ExportDownload } from '$lib/models/deliverables';

/** A mounted export dialog owns its generation, progress and preview URL. */
export class DocumentExportStore {
	private revision = 0;
	private bound = $state.raw<DeliverableBinding | null>(null);
	private loadedDocuments = $state.raw<readonly NoteDocument[]>([]);
	private previewRevision = 0;
	get binding() {
		return this.bound;
	}
	get documents() {
		return this.loadedDocuments;
	}
	get previewGeneration() {
		return this.previewRevision;
	}
	advancePreview(): void {
		this.previewRevision++;
	}
	bind(binding: DeliverableBinding): void {
		this.bound = binding;
	}
	setDocuments(documents: readonly NoteDocument[]): void {
		this.loadedDocuments = documents;
	}
	private status = $state<'closed' | 'loading' | 'ready'>('closed');
	private working = $state(false);
	private failure = $state('');
	private download = $state<ExportDownload | null>(null);
	private preview = $state('');
	get generation(): number {
		return this.revision;
	}
	get ready(): boolean {
		return this.status === 'ready';
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
		this.status = 'loading';
		this.working = false;
		this.failure = '';
		this.download = null;
		return this.revision;
	}
	loaded(): void {
		this.status = 'ready';
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
		this.status = 'closed';
		this.bound = null;
		this.loadedDocuments = [];
		this.download = null;
		this.failure = '';
		this.working = false;
		this.preview = '';
	}
}
