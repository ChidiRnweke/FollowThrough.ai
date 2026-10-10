import type {
	NoteId,
	NoteDraftInput,
	NoteDraftSave,
	SectionNumberingLevel
} from '$lib/models/notes';
import type { WorkspaceSave } from '$lib/models/workspace-editing';
import type { PreparedWorkspaceCommand } from '$lib/models/workspace-mutations';
import type { NoteSectionNumbering } from '$lib/services/notes/section-numbering';
export interface NoteDraftPersistence {
	readonly active: boolean;
	stage(
		command: Extract<PreparedWorkspaceCommand, { kind: 'saveNote' | 'noteNumbering' }>
	): Promise<WorkspaceSave<'notes'>>;
}
export interface NoteDraftEditingController {
	save(note: NoteDraftInput): Promise<NoteDraftSave>;
	togglePin(note: NoteDraftInput): Promise<NoteDraftSave>;
	numbering(level: SectionNumberingLevel): Promise<NoteDraftSave>;
}
/** Save authored fields and settings against this editor's captured ancestry. */
export class NoteDraftEditing implements NoteDraftEditingController {
	constructor(
		private readonly noteId: NoteId,
		private readonly draft: NoteDraftPersistence,
		private readonly sections: NoteSectionNumbering
	) {}
	save(note: NoteDraftInput): Promise<NoteDraftSave> {
		return this.stage({
			kind: 'saveNote',
			noteId: note.id,
			document: note.document,
			plainText: note.plainText,
			title: note.title,
			isPinned: note.isPinned
		});
	}
	togglePin(note: NoteDraftInput): Promise<NoteDraftSave> {
		return this.save({ ...note, isPinned: !note.isPinned });
	}
	numbering(level: SectionNumberingLevel): Promise<NoteDraftSave> {
		return this.stage({
			kind: 'noteNumbering',
			noteId: this.noteId,
			enabled: this.sections.fromMenu(level)
		});
	}
	private async stage(
		command: Extract<PreparedWorkspaceCommand, { kind: 'saveNote' | 'noteNumbering' }>
	): Promise<NoteDraftSave> {
		if (!this.draft.active)
			return { kind: 'failure', message: 'The note editor is no longer active' };
		const result = await this.draft.stage(command);
		if (!this.draft.active)
			return { kind: 'failure', message: 'The note editor is no longer active' };
		if (result.kind === 'failure') return result;
		return result.value
			? { kind: 'saved', value: result.value }
			: { kind: 'failure', message: 'The note no longer exists' };
	}
}
