import type { Note, NoteId } from '$lib/models/notes';
import type { PreparedWorkspaceCommand } from '$lib/models/workspace-mutations';
import type { NoteReplacementDraft } from '$lib/controllers/notes/replace';

export class InMemoryReplacementDraft implements NoteReplacementDraft {
	private captured: Note | null = null;
	failSave = false;
	constructor(
		private readonly notes: Map<NoteId, Note>,
		private readonly noteId: NoteId
	) {}
	capture(): void {
		this.captured = this.notes.get(this.noteId) ?? null;
	}
	get value(): Note | null {
		return this.captured;
	}
	async stage(
		command: PreparedWorkspaceCommand
	): Promise<{ kind: 'saved' } | { kind: 'failure'; message: string }> {
		if (this.failSave) return { kind: 'failure', message: 'Device storage is full' };
		const current = this.notes.get(this.noteId);
		if (!current || !this.captured || command.kind !== 'saveNote' || command.noteId !== this.noteId)
			throw new Error('A captured note save is required');
		if (current.currentRevision !== this.captured.currentRevision)
			return { kind: 'failure', message: 'The note changed after capture' };
		this.notes.set(this.noteId, {
			...current,
			title: command.title ?? current.title,
			document: command.document,
			plainText: command.plainText,
			isPinned: command.isPinned ?? current.isPinned,
			currentRevision: current.currentRevision + 1
		});
		return { kind: 'saved' };
	}
}
