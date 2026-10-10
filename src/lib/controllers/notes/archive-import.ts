import type { ImportMarkdownArchiveOutput, ProjectId } from '$lib/models/projects';
import type { NoteId } from '$lib/models/notes';
import type {
	WorkspaceSession,
	WorkspaceSessionController
} from '$lib/controllers/workspace/session';
import type { ArchiveImportStore } from '$lib/stores/notes/archive-import.svelte';
import type { ArchiveImportResponse } from '$lib/models/projects';
export interface ArchiveImportUpload {
	upload(
		archive: File,
		projectId: ProjectId,
		parentId?: NoteId
	): Promise<{ readonly accepted: boolean; readonly result: ArchiveImportResponse }>;
}
export interface ArchiveImportController {
	readonly busy: boolean;
	readonly error: string;
	readonly report: ImportMarkdownArchiveOutput | undefined;
	import(
		archive: File,
		projectId: ProjectId,
		parentId?: NoteId
	): Promise<void | { readonly kind: 'failure'; readonly message: string }>;
	reset(): void;
}
export class ArchiveImports implements ArchiveImportController {
	constructor(
		private readonly state: ArchiveImportStore,
		private readonly workspace: WorkspaceSessionController,
		private readonly upload: ArchiveImportUpload
	) {}
	get busy(): boolean {
		return this.state.busy;
	}
	get error(): string {
		return this.state.error;
	}
	get report(): ImportMarkdownArchiveOutput | undefined {
		return this.state.report;
	}
	private current(generation: number, session: WorkspaceSession): boolean {
		return (
			this.state.generation === generation &&
			this.workspace.current === session &&
			session.resources.active
		);
	}
	async import(
		archive: File,
		projectId: ProjectId,
		parentId?: NoteId
	): Promise<void | { readonly kind: 'failure'; readonly message: string }> {
		if (this.busy) return;
		const generation = this.state.generation;
		let session: WorkspaceSession | undefined;
		this.state.begin();
		try {
			session = await this.workspace.start();
			if (!this.current(generation, session)) return;
			const { accepted, result } = await this.upload.upload(archive, projectId, parentId);
			if (!this.current(generation, session)) return;
			if (accepted) await this.workspace.synchronize();
			if (!this.current(generation, session)) return;
			if (result.kind === 'failure') this.state.fail(result.message);
			else this.state.publish(result.report);
		} catch {
			const message =
				'The import outcome could not be confirmed. Check the project before trying again.';
			if (generation === this.state.generation && (!session || this.current(generation, session)))
				this.state.fail(message);
			return { kind: 'failure', message };
		} finally {
			if (generation === this.state.generation) this.state.finish();
		}
	}
	reset(): void {
		this.state.reset();
	}
}
