import { invalidateAll } from '$app/navigation';
import type {
	ArchiveNoteOutput,
	CreateFolderOutput,
	CreateNoteOutput,
	CreateProjectOutput,
	CreateSkillOutput,
	MoveProjectEntryOutput,
	NoteId,
	ProjectId,
	RenameNoteOutput,
	RenameProjectOutput
} from '$lib/models';
import {
	createProject,
	renameProject,
	archiveProject,
	createFolder,
	moveEntry,
	createNote,
	renameNote,
	archiveNote,
	createSkill
} from '$lib/remote/projects.remote';

class ProjectActionsStore {
	busy = $state(false);

	private async withInvalidation<T>(fn: () => Promise<T>): Promise<T | undefined> {
		this.busy = true;
		try {
			const result = await fn();
			await invalidateAll();
			return result;
		} catch {
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
}

export const projectActions = new ProjectActionsStore();
