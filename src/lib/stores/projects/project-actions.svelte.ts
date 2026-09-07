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
	archiveNote,
	restoreNote,
	moveEntry,
	deleteNoteForever,
	emptyNoteTrash,
	createSkill
} from '$lib/remote/projects/projects.remote';
import { newProject, newNote } from '$lib/models/workspace-mutations';
import { workspaceResourceKey } from '$lib/models/workspace-sync';
import type { DateTime } from '$lib/models/workspace';
import type { WorkspaceRecord, WorkspaceValues } from '$lib/models/workspace-records';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import type { WorkspaceDraft } from '$lib/stores/workspace/resources.svelte';
import type { WriteContent } from '$lib/models/outbox';

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
		content: (value: WorkspaceValues[K]) => WriteContent<WorkspaceCommand, WorkspaceRecord>
	): Promise<WorkspaceValues[K]> {
		const session = await workspaceSession.start();
		const draft = session.resources.draft({ type, id: [id] });
		const opened = await draft.read();
		if (opened.kind !== 'ready') throw new Error(draft.lastError ?? 'The resource is unavailable');
		const staged = await draft.stage(content(opened.value));
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
		const opened = await session.resources.open({ type: 'projects', id: [projectId] });
		if (opened.kind !== 'ready' || opened.value.type !== 'projects')
			throw new Error('The project is unavailable');
		await session.resources.prepare(['notes']);
		const note = newNote(
			crypto.randomUUID() as NoteId,
			opened.value.value,
			title,
			kind,
			session.resources.views.all('notes'),
			new Date().toISOString() as DateTime,
			parentId
		);
		await session.resources.append({
			operationId: crypto.randomUUID(),
			key: workspaceResourceKey({ type: 'notes', id: [note.id] }),
			command:
				kind === 'note'
					? { kind: 'createNote', id: note.id, projectId, parentId, title }
					: { kind: 'createFolder', id: note.id, projectId, parentId, name: title },
			base: null,
			basedOn: null,
			local: { type: 'notes', value: note },
			coalesce: null,
			references: [
				workspaceResourceKey({ type: 'projects', id: [projectId] }),
				...(parentId ? [workspaceResourceKey({ type: 'notes', id: [parentId] })] : [])
			]
		});
		return note;
	}
	createProject = (name: string) =>
		this.run<CreateProjectOutput>(async () => {
			const session = await workspaceSession.start();
			const project = newProject(
				crypto.randomUUID() as ProjectId,
				session.shell.user.id,
				name,
				new Date().toISOString() as DateTime
			);
			await session.resources.append({
				operationId: crypto.randomUUID(),
				key: workspaceResourceKey({ type: 'projects', id: [project.id] }),
				command: { kind: 'createProject', id: project.id, name },
				base: null,
				basedOn: null,
				local: { type: 'projects', value: project },
				coalesce: null,
				references: []
			});
			return { project };
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
			const result = await draft.stage({
				command: { kind: 'renameProject', projectId: project.id, name },
				local: {
					type: 'projects',
					value: { ...project, name: name.trim() }
				},
				coalesce: null,
				references: []
			});
			if (result.kind === 'failure') throw new Error(result.message);
			if (!result.value) throw new Error('The project no longer exists');
			return { project: result.value };
		});

	archiveProject = (projectId: ProjectId) =>
		this.run(async () => ({
			project: await this.edit('projects', projectId, (project) => ({
				command: { kind: 'archiveProject', projectId },
				local: {
					type: 'projects',
					value: { ...project, archivedAt: new Date().toISOString() as DateTime }
				},
				coalesce: null,
				references: []
			}))
		}));
	setSectionNumberingDefault = (projectId: ProjectId, enabled?: boolean) =>
		this.run<SetProjectSectionNumberingOutput>(async () => ({
			project: await this.edit('projects', projectId, (project) => ({
				command: { kind: 'projectNumbering', projectId, enabled },
				local: { type: 'projects', value: { ...project, sectionNumberingDefault: enabled } },
				coalesce: null,
				references: []
			}))
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
			const result = await draft.stage({
				command: { kind: 'renameNote', noteId: note.id, title },
				local: { type: 'notes', value: { ...note, title: title.trim() } },
				coalesce: null,
				references: []
			});
			if (result.kind === 'failure') throw new Error(result.message);
			if (!result.value) throw new Error('The note no longer exists');
			return { note: result.value };
		});

	archiveNote = (noteId: NoteId) =>
		this.serverAction<ArchiveNoteOutput>(() => archiveNote({ noteId }));
	restoreNote = (noteId: NoteId) =>
		this.serverAction<RestoreNoteOutput>(() => restoreNote({ noteId }));
	deleteNoteForever = (noteId: NoteId) =>
		this.serverAction<DeleteNoteForeverOutput>(() => deleteNoteForever({ noteId }));
	emptyNoteTrash = (projectId?: ProjectId) =>
		this.serverAction<EmptyNoteTrashOutput>(() => emptyNoteTrash({ projectId }));
}

export const projectActions = new ProjectActionsStore();
