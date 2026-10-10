import type { ImportMarkdownArchiveOutput } from '$lib/models/projects';
export class ArchiveImportStore {
	private revision = 0;
	private working = $state(false);
	private failure = $state('');
	private output = $state<ImportMarkdownArchiveOutput>();
	get generation(): number {
		return this.revision;
	}
	get busy(): boolean {
		return this.working;
	}
	get error(): string {
		return this.failure;
	}
	get report(): ImportMarkdownArchiveOutput | undefined {
		return this.output;
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
	publish(report: ImportMarkdownArchiveOutput): void {
		this.output = report;
	}
	reset(): void {
		this.revision += 1;
		this.working = false;
		this.failure = '';
		this.output = undefined;
	}
}
