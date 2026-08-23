import { invalidateAll } from '$app/navigation';
import { isHttpError } from '@sveltejs/kit';
import type {
	ArchiveNoteOutput,
	CreateNoteOutput,
	DeleteNoteForeverOutput,
	EmptyNoteTrashOutput,
	NoteId,
	RenameNoteOutput,
	RestoreNoteOutput
} from '$lib/models/notes';
import type {
	CreateFolderOutput,
	CreateProjectOutput,
	MoveProjectEntryOutput,
	ProjectId,
	RenameProjectOutput,
	SetProjectSectionNumberingOutput
} from '$lib/models/projects';
import type { CreateSkillOutput } from '$lib/models/skills';
import {
	createProject,
	renameProject,
	archiveProject,
	createFolder,
	moveEntry,
	createNote,
	renameNote,
	archiveNote,
	restoreNote,
	deleteNoteForever,
	emptyNoteTrash,
	createSkill,
	setProjectSectionNumberingDefault
} from '$lib/remote/projects/projects.remote';

class ProjectActionsStore {
	busy = $state(false);
	/** Message from the last failed action, when the server explained itself. */
	lastError = $state<string | undefined>(undefined);

	private async withInvalidation<T>(fn: () => Promise<T>): Promise<T | undefined> {
		this.busy = true;
		this.lastError = undefined;
		try {
			const result = await fn();
			await invalidateAll();
			return result;
			// audit-allow: silent-catch — undefined is the typed action failure outcome and lastError preserves any domain message for the caller.
		} catch (error) {
			// Domain failures (name taken, folder not empty, …) carry a message worth
			// showing; unexpected errors fall back to each caller's generic copy.
			this.lastError = isHttpError(error) ? error.body.message : undefined;
			return undefined;
		} finally {
			this.busy = false;
		}
	}

	createProject = (name: string) =>
		this.withInvalidation<CreateProjectOutput>(() => createProject({ name }));
	renameProject = (projectId: ProjectId, name: string) =>
		this.withInvalidation<RenameProjectOutput>(() => renameProject({ projectId, name }));
	archiveProject = (projectId: ProjectId) =>
		this.withInvalidation(() => archiveProject({ projectId }));
	setSectionNumberingDefault = (projectId: ProjectId, enabled?: boolean) =>
		this.withInvalidation<SetProjectSectionNumberingOutput>(() =>
			setProjectSectionNumberingDefault({ projectId, enabled })
		);
	createFolder = (projectId: ProjectId, name: string, parentId?: NoteId) =>
		this.withInvalidation<CreateFolderOutput>(() => createFolder({ projectId, name, parentId }));
	moveEntry = (
		projectId: ProjectId,
		entryId: NoteId,
		parentId: NoteId | undefined,
		position: number
	) =>
		this.withInvalidation<MoveProjectEntryOutput>(() =>
			moveEntry({ projectId, entryId, parentId, position })
		);
	createNote = (title: string, projectId?: ProjectId, parentId?: NoteId) =>
		this.withInvalidation<CreateNoteOutput>(() => createNote({ title, projectId, parentId }));
	createSkill = (name: string, projectId?: ProjectId, parentId?: NoteId) =>
		this.withInvalidation<CreateSkillOutput>(() => createSkill({ name, projectId, parentId }));
	renameNote = (noteId: NoteId, title: string) =>
		this.withInvalidation<RenameNoteOutput>(() => renameNote({ noteId, title }));
	archiveNote = (noteId: NoteId) =>
		this.withInvalidation<ArchiveNoteOutput>(() => archiveNote({ noteId }));
	restoreNote = (noteId: NoteId) =>
		this.withInvalidation<RestoreNoteOutput>(() => restoreNote({ noteId }));
	deleteNoteForever = (noteId: NoteId) =>
		this.withInvalidation<DeleteNoteForeverOutput>(() => deleteNoteForever({ noteId }));
	emptyNoteTrash = (projectId?: ProjectId) =>
		this.withInvalidation<EmptyNoteTrashOutput>(() => emptyNoteTrash({ projectId }));
}

export const projectActions = new ProjectActionsStore();
