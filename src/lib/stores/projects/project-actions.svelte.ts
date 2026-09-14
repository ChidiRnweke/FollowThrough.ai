import { workspaceSession } from '$lib/stores/workspace/session.svelte';
import { isHttpError } from '@sveltejs/kit';
import type {
	ArchiveNoteOutput,
	CreateNoteOutput,
	DeleteNoteForeverOutput,
	EmptyNoteTrashOutput,
	NoteId,
	Note,
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
	moveEntry,
	deleteNoteForever,
	emptyNoteTrash,
	createSkill
} from '$lib/remote/projects/projects.remote';
import type { PreparedWorkspaceCommand } from '$lib/models/workspace-mutations';

import type { WorkspaceValues } from '$lib/models/workspace-records';

import type { WorkspaceDraft } from '$lib/stores/workspace/resources.svelte';

class ProjectActionsStore {
	busy = $state(false);
	/** Message from the last failed action, when the server explained itself. */
	lastError = $state<string | undefined>(undefined);

	private async serverAction<T>(fn: () => Promise<T>): Promise<T | undefined> {
		return this.run(async () => {
			const value = await fn();
			await workspaceSession.synchronize();
			return value;
		});
	}
	private async run<T>(fn: () => Promise<T>): Promise<T | undefined> {
		this.busy = true;
		this.lastError = undefined;
		try {
			const result = await fn();
			return result;
			// audit-allow: silent-catch — undefined is the typed action failure outcome and lastError preserves any domain message for the caller.
		} catch (error) {
			// Domain failures (name taken, folder not empty, …) carry a message worth
			// showing; unexpected errors fall back to each caller's generic copy.
			this.lastError = isHttpError(error)
				? error.body.message
				: error instanceof Error
					? error.message
					: 'The action could not be saved';
			return undefined;
		} finally {
			this.busy = false;
		}
	}

	private async edit<K extends 'projects' | 'notes'>(
		type: K,
		id: string,
		command: PreparedWorkspaceCommand
	): Promise<WorkspaceValues[K]> {
		const session = await workspaceSession.start();
		const draft = session.resources.draft({ type, id: [id] });
		const opened = await draft.read();
		if (opened.kind !== 'ready') throw new Error(draft.lastError ?? 'The resource is unavailable');
		const staged = await draft.stage(command);
		if (staged.kind === 'failure') throw new Error(staged.message);
		if (!staged.value) throw new Error('The edited resource no longer exists');
		return staged.value;
	}

	private async createEntry(
		title: string,
		projectId: ProjectId,
		kind: 'note' | 'folder',
		parentId?: NoteId
	): Promise<Note> {
		const session = await workspaceSession.start();
		await session.resources.open({ type: 'projects', id: [projectId] });
		await session.resources.prepare(['notes']);
		const id = crypto.randomUUID() as NoteId;
		const record = await session.resources.create(
			kind === 'note'
				? { kind: 'createNote', id, projectId, parentId, title }
				: { kind: 'createFolder', id, projectId, parentId, name: title }
		);
		if (record.type !== 'notes') throw new Error('Note creation returned another resource');
		return record.value;
	}
	createProject = (name: string) =>
		this.run<CreateProjectOutput>(async () => {
			const session = await workspaceSession.start();
			const record = await session.resources.create({
				kind: 'createProject',
				id: crypto.randomUUID() as ProjectId,
				name
			});
			if (record.type !== 'projects') throw new Error('Project creation returned another resource');
			return { project: record.value };
		});

	editor<K extends 'notes' | 'projects'>(type: K, id: string): WorkspaceDraft<K> {
		const session = workspaceSession.current;
		if (!session) throw new Error('Open the workspace before editing');
		const draft = session.resources.draft({ type, id: [id] });
		draft.capture();
		return draft;
	}
	renameProject = (draft: WorkspaceDraft<'projects'>, name: string) =>
		this.run<RenameProjectOutput>(async () => {
			const project = draft.value;
			if (!project) throw new Error('The project is unavailable');
			const result = await draft.stage({ kind: 'renameProject', projectId: project.id, name });
			if (result.kind === 'failure') throw new Error(result.message);
			if (!result.value) throw new Error('The project no longer exists');
			return { project: result.value };
		});

	archiveProject = (projectId: ProjectId) =>
		this.run(async () => ({
			project: await this.edit('projects', projectId, { kind: 'archiveProject', projectId })
		}));
	setSectionNumberingDefault = (projectId: ProjectId, enabled?: boolean) =>
		this.run<SetProjectSectionNumberingOutput>(async () => ({
			project: await this.edit('projects', projectId, {
				kind: 'projectNumbering',
				projectId,
				enabled
			})
		}));

	createFolder = (projectId: ProjectId, name: string, parentId?: NoteId) =>
		this.run<CreateFolderOutput>(async () => ({
			folder: await this.createEntry(name, projectId, 'folder', parentId)
		}));

	moveEntry = (
		projectId: ProjectId,
		entryId: NoteId,
		parentId: NoteId | undefined,
		position: number
	) =>
		this.serverAction<MoveProjectEntryOutput>(() =>
			moveEntry({ projectId, entryId, parentId, position })
		);
	createNote = (title: string, projectId: ProjectId, parentId?: NoteId) =>
		this.run<CreateNoteOutput>(async () => ({
			note: await this.createEntry(title, projectId, 'note', parentId)
		}));
	createSkill = (name: string, projectId: ProjectId, parentId?: NoteId) =>
		this.serverAction<CreateSkillOutput>(() => createSkill({ name, projectId, parentId }));
	renameNote = (draft: WorkspaceDraft<'notes'>, title: string) =>
		this.run<RenameNoteOutput>(async () => {
			const note = draft.value;
			if (!note) throw new Error('The note is unavailable');
			const result = await draft.stage({ kind: 'renameNote', noteId: note.id, title });
			if (result.kind === 'failure') throw new Error(result.message);
			if (!result.value) throw new Error('The note no longer exists');
			return { note: result.value };
		});

	private changeTrash(noteId: NoteId, action: 'archive' | 'restore'): Promise<Note> {
		return this.edit('notes', noteId, {
			kind: action === 'archive' ? 'archiveNote' : 'restoreNote',
			noteId
		});
	}

	archiveNote = (noteId: NoteId) =>
		this.run<ArchiveNoteOutput>(async () => ({ note: await this.changeTrash(noteId, 'archive') }));
	restoreNote = (noteId: NoteId) =>
		this.run<RestoreNoteOutput>(async () => {
			const session = await workspaceSession.start();
			const opened = await session.resources.open({ type: 'notes', id: [noteId] });
			if (opened.kind !== 'ready' || opened.value.type !== 'notes')
				throw new Error('The note is unavailable');
			if (opened.value.value.parentId) {
				const parent = await session.resources.lookup({
					type: 'notes',
					id: [opened.value.value.parentId]
				});
				if (parent.kind !== 'ready' && parent.kind !== 'absent' && parent.kind !== 'deleted')
					throw new Error('The parent folder is unavailable on this device');
			}
			return { note: await this.changeTrash(noteId, 'restore') };
		});
	deleteNoteForever = (noteId: NoteId) =>
		this.serverAction<DeleteNoteForeverOutput>(() => deleteNoteForever({ noteId }));
	emptyNoteTrash = (projectId?: ProjectId) =>
		this.serverAction<EmptyNoteTrashOutput>(() => emptyNoteTrash({ projectId }));
}

export const projectActions = new ProjectActionsStore();
