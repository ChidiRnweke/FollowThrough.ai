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
import type { PreparedWorkspaceCommand } from '$lib/models/workspace-mutations';

import type { WorkspaceValues } from '$lib/models/workspace-records';

import type { SessionSynchronization } from '$lib/controllers/workspace/session';
import type { WorkspaceResourcesController } from '$lib/controllers/workspace/resources';
import type { ProjectActionStore } from '$lib/stores/projects/project-actions.svelte';

export interface ProjectNameEditor<K extends 'notes' | 'projects'> {
	readonly value: Readonly<WorkspaceValues[K]> | null;
	rename(name: string): Promise<WorkspaceValues[K]>;
}
export interface ProjectActionSession {
	readonly resources: WorkspaceResourcesController;
}
export interface ProjectActionWorkspace {
	readonly current: ProjectActionSession | null;
	start(): Promise<ProjectActionSession>;
	synchronize(): Promise<SessionSynchronization>;
}
export interface ProjectActionRemote {
	move(input: {
		projectId: ProjectId;
		entryId: NoteId;
		parentId: NoteId | undefined;
		position: number;
	}): Promise<MoveProjectEntryOutput<Note>>;
	createSkill(input: {
		name: string;
		projectId: ProjectId;
		parentId?: NoteId;
	}): Promise<CreateSkillOutput<Note>>;
	deleteNote(input: { noteId: NoteId }): Promise<DeleteNoteForeverOutput>;
	emptyTrash(input: { projectId?: ProjectId }): Promise<EmptyNoteTrashOutput>;
}
export interface ProjectActionEnvironment {
	readonly accountId: string | null;
	identity(): string;
	attempt<T>(
		operation: () => Promise<T>
	): Promise<{ kind: 'success'; value: T } | { kind: 'failure'; message: string }>;
}
export interface ProjectActionsController {
	readonly busy: boolean;
	readonly lastError: string | undefined;
	editor<K extends 'notes' | 'projects'>(type: K, id: string): ProjectNameEditor<K>;
	createProject(name: string): Promise<CreateProjectOutput | undefined>;
	renameProject(
		editor: ProjectNameEditor<'projects'>,
		name: string
	): Promise<RenameProjectOutput | undefined>;
	archiveProject(
		projectId: ProjectId
	): Promise<{ project: WorkspaceValues['projects'] } | undefined>;
	setSectionNumberingDefault(
		projectId: ProjectId,
		enabled?: boolean
	): Promise<SetProjectSectionNumberingOutput | undefined>;
	createFolder(
		projectId: ProjectId,
		name: string,
		parentId?: NoteId
	): Promise<CreateFolderOutput<Note> | undefined>;
	moveEntry(
		projectId: ProjectId,
		entryId: NoteId,
		parentId: NoteId | undefined,
		position: number
	): Promise<MoveProjectEntryOutput<Note> | undefined>;
	createNote(
		title: string,
		projectId: ProjectId,
		parentId?: NoteId
	): Promise<CreateNoteOutput | undefined>;
	createSkill(
		name: string,
		projectId: ProjectId,
		parentId?: NoteId
	): Promise<CreateSkillOutput<Note> | undefined>;
	renameNote(
		editor: ProjectNameEditor<'notes'>,
		title: string
	): Promise<RenameNoteOutput | undefined>;
	archiveNote(noteId: NoteId): Promise<ArchiveNoteOutput | undefined>;
	restoreNote(noteId: NoteId): Promise<RestoreNoteOutput | undefined>;
	deleteNoteForever(noteId: NoteId): Promise<DeleteNoteForeverOutput | undefined>;
	emptyNoteTrash(projectId?: ProjectId): Promise<EmptyNoteTrashOutput | undefined>;
}
export class ProjectActions implements ProjectActionsController {
	constructor(
		private readonly state: ProjectActionStore,
		private readonly workspace: ProjectActionWorkspace,
		private readonly remote: ProjectActionRemote,
		private readonly environment: ProjectActionEnvironment
	) {}
	get busy(): boolean {
		return this.currentState ? this.state.busy : false;
	}
	get lastError(): string | undefined {
		return this.currentState ? this.state.lastError : undefined;
	}
	private get currentState(): boolean {
		return (
			this.state.accountId === this.environment.accountId &&
			(this.state.binding === null || this.state.binding === this.workspace.current)
		);
	}
	private requireSession(session: ProjectActionSession | null, accountId: string | null): void {
		if (accountId !== this.environment.accountId || (session && this.workspace.current !== session))
			throw new Error('The workspace account changed during the project action.');
	}
	private async serverAction<T>(fn: () => Promise<T>): Promise<T | undefined> {
		return this.run(async () => {
			const session = this.workspace.current;
			const accountId = this.environment.accountId;
			const value = await fn();
			this.requireSession(session, accountId);
			await this.workspace.synchronize();
			return value;
		});
	}

	private async run<T>(fn: () => Promise<T>): Promise<T | undefined> {
		const session = this.workspace.current;
		const accountId = this.environment.accountId;
		if (this.state.binding !== session || this.state.accountId !== accountId)
			this.state.reset(session, accountId);
		const generation = this.state.begin();
		try {
			const outcome = await this.environment.attempt(fn);
			if (
				accountId !== this.environment.accountId ||
				(session && this.workspace.current !== session)
			)
				return undefined;
			if (outcome.kind === 'failure') {
				this.state.fail(generation, outcome.message);
				return undefined;
			}
			return outcome.value;
		} finally {
			this.state.finish(generation);
		}
	}

	private async edit<K extends 'projects' | 'notes'>(
		type: K,
		id: string,
		command: PreparedWorkspaceCommand
	): Promise<WorkspaceValues[K]> {
		const accountId = this.environment.accountId;
		const session = await this.workspace.start();
		this.requireSession(session, accountId);
		const draft = session.resources.draft({ type, id: [id] });
		const opened = await draft.read();
		if (opened.kind !== 'ready') throw new Error(draft.lastError ?? 'The resource is unavailable');
		this.requireSession(session, accountId);
		const staged = await draft.stage(command);
		this.requireSession(session, accountId);
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
		const accountId = this.environment.accountId;
		const session = await this.workspace.start();
		this.requireSession(session, accountId);
		await session.resources.open({ type: 'projects', id: [projectId] });
		await session.resources.prepare();
		this.requireSession(session, accountId);
		const id = this.environment.identity() as NoteId;
		const record = await session.resources.create(
			kind === 'note'
				? { kind: 'createNote', id, projectId, parentId, title }
				: { kind: 'createFolder', id, projectId, parentId, name: title }
		);
		this.requireSession(session, accountId);
		if (record.type !== 'notes') throw new Error('Note creation returned another resource');
		return record.value;
	}
	createProject = (name: string) =>
		this.run<CreateProjectOutput>(async () => {
			const accountId = this.environment.accountId;
			const session = await this.workspace.start();
			this.requireSession(session, accountId);
			const record = await session.resources.create({
				kind: 'createProject',
				id: this.environment.identity() as ProjectId,
				name
			});
			this.requireSession(session, accountId);
			if (record.type !== 'projects') throw new Error('Project creation returned another resource');
			return { project: record.value };
		});

	editor<K extends 'notes' | 'projects'>(type: K, id: string): ProjectNameEditor<K> {
		const session = this.workspace.current;
		const accountId = this.environment.accountId;
		if (!session) throw new Error('Open the workspace before editing');
		const draft = session.resources.draft({ type, id: [id] });
		draft.capture();
		return {
			get value() {
				return draft.value;
			},
			rename: async (name) => {
				this.requireSession(session, accountId);
				const value = draft.value;
				if (!value)
					throw new Error(
						type === 'projects' ? 'The project is unavailable' : 'The note is unavailable'
					);
				const result = await draft.stage(
					type === 'projects'
						? { kind: 'renameProject', projectId: value.id as ProjectId, name }
						: { kind: 'renameNote', noteId: value.id as NoteId, title: name }
				);
				if (result.kind === 'failure') throw new Error(result.message);
				if (!result.value)
					throw new Error(
						type === 'projects' ? 'The project no longer exists' : 'The note no longer exists'
					);
				this.requireSession(session, accountId);
				return result.value;
			}
		};
	}
	renameProject = (editor: ProjectNameEditor<'projects'>, name: string) =>
		this.run<RenameProjectOutput>(async () => ({ project: await editor.rename(name) }));

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
		this.run<CreateFolderOutput<Note>>(async () => ({
			folder: await this.createEntry(name, projectId, 'folder', parentId)
		}));

	moveEntry = (
		projectId: ProjectId,
		entryId: NoteId,
		parentId: NoteId | undefined,
		position: number
	) =>
		this.serverAction<MoveProjectEntryOutput<Note>>(() =>
			this.remote.move({ projectId, entryId, parentId, position })
		);
	createNote = (title: string, projectId: ProjectId, parentId?: NoteId) =>
		this.run<CreateNoteOutput>(async () => ({
			note: await this.createEntry(title, projectId, 'note', parentId)
		}));
	createSkill = (name: string, projectId: ProjectId, parentId?: NoteId) =>
		this.serverAction<CreateSkillOutput<Note>>(() =>
			this.remote.createSkill({ name, projectId, parentId })
		);
	renameNote = (editor: ProjectNameEditor<'notes'>, title: string) =>
		this.run<RenameNoteOutput>(async () => ({ note: await editor.rename(title) }));

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
			const accountId = this.environment.accountId;
			const session = await this.workspace.start();
			this.requireSession(session, accountId);
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
			this.requireSession(session, accountId);
			return { note: await this.changeTrash(noteId, 'restore') };
		});
	deleteNoteForever = (noteId: NoteId) =>
		this.serverAction<DeleteNoteForeverOutput>(() => this.remote.deleteNote({ noteId }));
	emptyNoteTrash = (projectId?: ProjectId) =>
		this.serverAction<EmptyNoteTrashOutput>(() => this.remote.emptyTrash({ projectId }));
}
