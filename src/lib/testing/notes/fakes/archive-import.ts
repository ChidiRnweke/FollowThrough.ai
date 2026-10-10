import type { ArchiveImportUpload } from '$lib/controllers/notes/archive-import';
import type { ArchiveImportResponse, ProjectId } from '$lib/models/projects';
import type { NoteId } from '$lib/models/notes';
export class InMemoryArchiveImportUpload implements ArchiveImportUpload {
	failure: Error | undefined;
	private gate: { started(): void; wait: Promise<void> } | undefined;
	constructor(
		readonly response: { readonly accepted: boolean; readonly result: ArchiveImportResponse },
		private readonly completed: () => void
	) {}
	pause(): { started: Promise<void>; release(): void } {
		const started = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		this.gate = { started: started.resolve, wait: release.promise };
		return { started: started.promise, release: release.resolve };
	}
	async upload(archive: File, projectId: ProjectId, parentId?: NoteId) {
		void archive;
		void projectId;
		void parentId;
		const gate = this.gate;
		this.gate = undefined;
		if (gate) {
			gate.started();
			await gate.wait;
		}
		if (this.failure) throw this.failure;
		this.completed();
		return this.response;
	}
}
