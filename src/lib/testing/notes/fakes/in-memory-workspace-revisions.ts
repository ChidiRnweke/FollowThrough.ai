import type { NoteId, NoteRevision, NoteRevisionId, NoteRevisionSummary } from '$lib/models/notes';
import type { NoteWorkspaceRevisions } from '$lib/controllers/notes/workspace';

export class InMemoryWorkspaceRevisions implements NoteWorkspaceRevisions {
	readonly values = new Map<NoteRevisionId, NoteRevision>();
	private pause: { started(): void; ready: Promise<void> } | null = null;
	constructor(
		private readonly apply: (revision: NoteRevision) => Promise<void>,
		private readonly publishedRevision: number
	) {}
	pauseRestore(): { started: Promise<void>; release(): void } {
		const started = Promise.withResolvers<void>();
		const ready = Promise.withResolvers<void>();
		this.pause = { started: started.resolve, ready: ready.promise };
		return { started: started.promise, release: ready.resolve };
	}
	async list(noteId: NoteId): Promise<readonly NoteRevisionSummary[]> {
		return [...this.values.values()]
			.filter((value) => value.noteId === noteId)
			.map((value) => ({ ...value, isPublished: value.revision === this.publishedRevision }));
	}
	async read(noteId: NoteId, revisionId: NoteRevisionId): Promise<NoteRevision> {
		const revision = this.values.get(revisionId);
		if (!revision || revision.noteId !== noteId) throw new Error('Revision unavailable');
		return revision;
	}
	async restore(noteId: NoteId, revisionId: NoteRevisionId): Promise<void> {
		const revision = await this.read(noteId, revisionId);
		const pause = this.pause;
		this.pause = null;
		if (pause) {
			pause.started();
			await pause.ready;
		}
		await this.apply(revision);
	}
}
