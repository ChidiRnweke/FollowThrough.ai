import type { ActorContext } from '$lib/models/identity';
import type {
	CreateFolderInput,
	CreateProjectInput,
	MoveProjectEntryInput,
	Project,
	ProjectId,
	ProjectTreeNode,
	RenameProjectInput
} from '$lib/models/projects';
import type { Note, NoteId } from '$lib/models/notes';
import { ConflictError, NotFoundError, ValidationError } from '$lib/errors';
import type {
	FolderCreator,
	ProjectCreator,
	ProjectEditor,
	ProjectEntryMover,
	ProjectLister,
	ProjectReader,
	ProjectTreeReader
} from '$lib/server/services/projects/contracts';
import {
	noteBuilder,
	projectBuilder,
	testNoteId,
	testNow,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

export class InMemoryProjects
	implements
		ProjectCreator,
		ProjectReader,
		ProjectLister,
		ProjectEditor,
		ProjectTreeReader,
		FolderCreator,
		ProjectEntryMover
{
	projects: Project[] = [];
	entries: Note[] = [];
	private nextProject = 100;
	private nextEntry = 100;

	async create(actor: ActorContext, input: CreateProjectInput): Promise<Project> {
		const name = input.name.trim();
		if (!name) throw new ValidationError('Project name is required');
		if (
			this.projects.some(
				(project) =>
					project.userId === actor.userId &&
					!project.archivedAt &&
					project.name.toLowerCase() === name.toLowerCase()
			)
		)
			throw new ConflictError('An active project with this name already exists');
		const project = projectBuilder({
			id: testProjectId(this.nextProject++),
			userId: actor.userId,
			name,
			...(input.description?.trim() ? { description: input.description.trim() } : {})
		});
		this.projects.push(project);
		return project;
	}

	async get(actor: ActorContext, projectId: ProjectId): Promise<Project> {
		const project = this.projects.find(
			(candidate) => candidate.id === projectId && candidate.userId === actor.userId
		);
		if (!project) throw new NotFoundError('Project was not found');
		return project;
	}

	async list(actor: ActorContext): Promise<readonly Project[]> {
		return this.projects
			.filter((project) => project.userId === actor.userId && !project.archivedAt)
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	async rename(actor: ActorContext, input: RenameProjectInput): Promise<Project> {
		const current = await this.get(actor, input.projectId);
		const name = input.name.trim();
		if (!name) throw new ValidationError('Project name is required');
		const updated: Project = {
			...current,
			name,
			...(input.description === undefined
				? {}
				: input.description.trim()
					? { description: input.description.trim() }
					: { description: undefined }),
			updatedAt: testNow
		};
		this.replaceProject(updated);
		return updated;
	}

	async archive(actor: ActorContext, projectId: ProjectId): Promise<Project> {
		const current = await this.get(actor, projectId);
		const updated = { ...current, archivedAt: testNow, updatedAt: testNow };
		this.replaceProject(updated);
		return updated;
	}

	async read(actor: ActorContext, projectId: ProjectId): Promise<readonly ProjectTreeNode[]> {
		await this.get(actor, projectId);
		const entries = this.entries
			.filter(
				(entry) =>
					entry.userId === actor.userId && entry.projectId === projectId && !entry.archivedAt
			)
			.sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
		const build = (parentId?: NoteId): ProjectTreeNode[] =>
			entries
				.filter((entry) => entry.parentId === parentId)
				.map((entry) => ({ entry, children: build(entry.id) }));
		return build();
	}

	async createFolder(actor: ActorContext, input: CreateFolderInput): Promise<Note> {
		await this.get(actor, input.projectId);
		const name = input.name.trim();
		if (!name) throw new ValidationError('Folder name is required');
		if (input.parentId) {
			const parent = this.requireEntry(actor, input.projectId, input.parentId);
			if (parent.kind !== 'folder') throw new ValidationError('A parent must be a folder');
		}
		const position = this.entries.filter(
			(entry) => entry.projectId === input.projectId && entry.parentId === input.parentId
		).length;
		const folder = noteBuilder({
			id: testNoteId(this.nextEntry++),
			userId: actor.userId,
			projectId: input.projectId,
			kind: 'folder',
			position,
			title: name,
			...(input.parentId ? { parentId: input.parentId } : {})
		});
		this.entries.push(folder);
		return folder;
	}

	async move(actor: ActorContext, input: MoveProjectEntryInput): Promise<Note> {
		if (!Number.isInteger(input.position) || input.position < 0)
			throw new ValidationError('Entry position must be a non-negative integer');
		const entry = this.requireEntry(actor, input.projectId, input.entryId);
		if (input.parentId === entry.id) throw new ValidationError('An entry cannot parent itself');
		if (input.parentId) {
			const parent = this.requireEntry(actor, input.projectId, input.parentId);
			if (parent.kind !== 'folder') throw new ValidationError('A parent must be a folder');
			let cursor: Note | undefined = parent;
			while (cursor) {
				if (cursor.id === entry.id)
					throw new ValidationError('An entry cannot move below its descendant');
				cursor = cursor.parentId
					? this.requireEntry(actor, input.projectId, cursor.parentId)
					: undefined;
			}
		}
		const oldSiblings = this.entries
			.filter((candidate) => candidate.parentId === entry.parentId && candidate.id !== entry.id)
			.sort((a, b) => a.position - b.position);
		const targetSiblings = (
			entry.parentId === input.parentId
				? oldSiblings
				: this.entries
						.filter(
							(candidate) => candidate.parentId === input.parentId && candidate.id !== entry.id
						)
						.sort((a, b) => a.position - b.position)
		).slice();
		targetSiblings.splice(Math.min(input.position, targetSiblings.length), 0, entry);
		const updates = new Map<NoteId, Note>();
		if (entry.parentId !== input.parentId)
			oldSiblings.forEach((candidate, position) =>
				updates.set(candidate.id, { ...candidate, position })
			);
		targetSiblings.forEach((candidate, position) =>
			updates.set(candidate.id, {
				...candidate,
				parentId: input.parentId,
				position,
				updatedAt: candidate.id === entry.id ? testNow : candidate.updatedAt
			})
		);
		this.entries = this.entries.map((candidate) => updates.get(candidate.id) ?? candidate);
		return updates.get(entry.id)!;
	}

	private requireEntry(actor: ActorContext, projectId: ProjectId, entryId: NoteId): Note {
		const entry = this.entries.find(
			(candidate) =>
				candidate.id === entryId &&
				candidate.projectId === projectId &&
				candidate.userId === actor.userId
		);
		if (!entry) throw new NotFoundError('Project entry was not found');
		return entry;
	}

	private replaceProject(project: Project): void {
		this.projects = this.projects.map((candidate) =>
			candidate.id === project.id ? project : candidate
		);
	}
}
