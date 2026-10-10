import type {
	ProjectActionEnvironment,
	ProjectActionRemote,
	ProjectActionWorkspace
} from '$lib/controllers/projects/actions';
import type { ProjectActionSession } from '$lib/controllers/projects/actions';
import type { NoteId } from '$lib/models/notes';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';

export class InMemoryProjectActionEnvironment implements ProjectActionEnvironment {
	accountId: string | null = 'alice';
	identity(): string {
		return crypto.randomUUID();
	}
	async attempt<T>(
		operation: () => Promise<T>
	): Promise<{ kind: 'success'; value: T } | { kind: 'failure'; message: string }> {
		try {
			return { kind: 'success', value: await operation() };
		} catch (error) {
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : 'The action could not be saved'
			};
		}
	}
}
export class InMemoryProjectActionWorkspace implements ProjectActionWorkspace {
	current: ProjectActionSession | null = null;
	synchronized: (ProjectActionSession | null)[] = [];
	async start(): Promise<ProjectActionSession> {
		if (!this.current) throw new Error('Workspace is not open');
		return this.current;
	}
	async synchronize() {
		this.synchronized.push(this.current);
		return { kind: 'complete' as const };
	}
}
export class InMemoryProjectActionRemote implements ProjectActionRemote {
	failure: Error | null = null;
	removed: NoteId[] = [];
	private gate: { started(): void; ready: Promise<void> } | null = null;
	pauseRemoval() {
		const started = Promise.withResolvers<void>();
		const ready = Promise.withResolvers<void>();
		this.gate = { started: started.resolve, ready: ready.promise };
		return { started: started.promise, release: ready.resolve };
	}
	async deleteNote(input: { noteId: NoteId }) {
		const gate = this.gate;
		this.gate = null;
		if (gate) {
			gate.started();
			await gate.ready;
		}
		if (this.failure) throw this.failure;
		this.removed.push(input.noteId);
		return { deletedNoteIds: [input.noteId], deletedNotes: [{ id: input.noteId, title: 'Note' }] };
	}
	async emptyTrash() {
		return {
			deletedNoteIds: this.removed,
			deletedNotes: this.removed.map((id) => ({ id, title: 'Note' }))
		};
	}
	async move() {
		return { entry: noteBuilder() };
	}
	async createSkill(): ReturnType<ProjectActionRemote['createSkill']> {
		throw new Error('No skill was seeded');
	}
}
