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

class ProjectActionsStore {
	busy = $state(false);

	private async request<T>(path: string, method: string, body: unknown): Promise<T | undefined> {
		this.busy = true;
		try {
			const response = await fetch(path, {
				method,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!response.ok) return undefined;
			const output = (await response.json()) as T;
			await invalidateAll();
			return output;
		} catch {
			return undefined;
		} finally {
			this.busy = false;
		}
	}

	createProject(name: string): Promise<CreateProjectOutput | undefined> {
		return this.request('/api/projects', 'POST', { op: 'create', name });
	}

	renameProject(projectId: ProjectId, name: string): Promise<RenameProjectOutput | undefined> {
		return this.request('/api/projects', 'POST', { op: 'rename', projectId, name });
	}

	archiveProject(projectId: ProjectId): Promise<RenameProjectOutput | undefined> {
		return this.request('/api/projects', 'POST', { op: 'archive', projectId });
	}

	createFolder(
		projectId: ProjectId,
		name: string,
		parentId?: NoteId
	): Promise<CreateFolderOutput | undefined> {
		return this.request('/api/projects', 'POST', { op: 'createFolder', projectId, name, parentId });
	}

	moveEntry(
		projectId: ProjectId,
		entryId: NoteId,
		parentId: NoteId | undefined,
		position: number
	): Promise<MoveProjectEntryOutput | undefined> {
		return this.request('/api/projects', 'POST', {
			op: 'move',
			projectId,
			entryId,
			parentId,
			position
		});
	}

	createNote(
		title: string,
		projectId?: ProjectId,
		parentId?: NoteId
	): Promise<CreateNoteOutput | undefined> {
		return this.request('/api/notes', 'POST', { title, projectId, parentId });
	}

	createSkill(
		name: string,
		projectId?: ProjectId,
		parentId?: NoteId
	): Promise<CreateSkillOutput | undefined> {
		return this.request('/api/skills', 'POST', { name, projectId, parentId });
	}

	renameNote(noteId: NoteId, title: string): Promise<RenameNoteOutput | undefined> {
		return this.request('/api/notes', 'POST', { op: 'rename', noteId, title });
	}

	archiveNote(noteId: NoteId): Promise<ArchiveNoteOutput | undefined> {
		return this.request('/api/notes', 'DELETE', { noteId });
	}
}

export const projectActions = new ProjectActionsStore();
