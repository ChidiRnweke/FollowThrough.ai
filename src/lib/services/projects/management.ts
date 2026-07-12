import type {
	ActorContext,
	CreateFolderInput,
	CreateProjectInput,
	MoveProjectEntryInput,
	Note,
	NoteId,
	Project,
	ProjectId,
	ProjectTreeNode,
	RenameProjectInput
} from '$lib/models';
import { NotFoundError, ValidationError } from '$lib/models';
import type { ProjectRepository, ProjectTreeRepository } from '$lib/repositories';
import type {
	FolderCreator,
	ProjectCreator,
	ProjectEditor,
	ProjectEntryMover,
	ProjectLister,
	ProjectReader,
	ProjectTreeReader
} from './contracts';

export class ProjectManagementService
	implements
		ProjectCreator,
		ProjectReader,
		ProjectLister,
		ProjectEditor,
		ProjectTreeReader,
		FolderCreator,
		ProjectEntryMover
{
	constructor(
		private readonly projects: ProjectRepository,
		private readonly tree: ProjectTreeRepository
	) {}

	async create(actor: ActorContext, input: CreateProjectInput): Promise<Project> {
		const name = input.name.trim();
		if (!name) throw new ValidationError('Project name is required');
		return this.projects.insert(actor, {
			...input,
			name,
			description: input.description?.trim() || undefined
		});
	}

	async get(actor: ActorContext, projectId: ProjectId): Promise<Project> {
		const project = await this.projects.findById(actor, projectId);
		if (!project) throw new NotFoundError('Project was not found');
		return project;
	}

	list(actor: ActorContext): Promise<readonly Project[]> {
		return this.projects.listActive(actor);
	}

	async rename(actor: ActorContext, input: RenameProjectInput): Promise<Project> {
		const name = input.name.trim();
		if (!name) throw new ValidationError('Project name is required');
		await this.get(actor, input.projectId);
		return this.projects.update(actor, {
			...input,
			name,
			description: input.description?.trim() || undefined
		});
	}

	async archive(actor: ActorContext, projectId: ProjectId): Promise<Project> {
		await this.get(actor, projectId);
		return this.projects.archive(actor, projectId);
	}

	async read(actor: ActorContext, projectId: ProjectId): Promise<readonly ProjectTreeNode[]> {
		await this.get(actor, projectId);
		const entries = await this.tree.list(actor, projectId);
		const children = new Map<NoteId | undefined, Note[]>();
		for (const entry of entries) {
			const siblings = children.get(entry.parentId) ?? [];
			children.set(entry.parentId, [...siblings, entry]);
		}
		const build = (parentId?: NoteId): ProjectTreeNode[] =>
			(children.get(parentId) ?? []).map((entry) => ({ entry, children: build(entry.id) }));
		return build();
	}

	async createFolder(actor: ActorContext, input: CreateFolderInput): Promise<Note> {
		const name = input.name.trim();
		if (!name) throw new ValidationError('Folder name is required');
		await this.get(actor, input.projectId);
		const entries = await this.tree.list(actor, input.projectId);
		if (input.parentId) this.requireFolder(entries, input.parentId);
		const position = entries.filter((entry) => entry.parentId === input.parentId).length;
		return this.tree.insertFolder(actor, { ...input, name }, position);
	}

	async move(actor: ActorContext, input: MoveProjectEntryInput): Promise<Note> {
		if (!Number.isInteger(input.position) || input.position < 0)
			throw new ValidationError('Entry position must be a non-negative integer');
		await this.get(actor, input.projectId);
		const entries = await this.tree.list(actor, input.projectId);
		const entry = this.requireEntry(entries, input.entryId);
		if (input.parentId === entry.id) throw new ValidationError('An entry cannot parent itself');
		if (input.parentId) {
			this.requireFolder(entries, input.parentId);
			let cursor: NoteId | undefined = input.parentId;
			while (cursor) {
				if (cursor === entry.id)
					throw new ValidationError('An entry cannot move below its descendant');
				cursor = this.requireEntry(entries, cursor).parentId;
			}
		}
		const oldSiblings = entries
			.filter((candidate) => candidate.parentId === entry.parentId && candidate.id !== entry.id)
			.sort((left, right) => left.position - right.position);
		const targetSiblings = (
			entry.parentId === input.parentId
				? oldSiblings
				: entries
						.filter(
							(candidate) => candidate.parentId === input.parentId && candidate.id !== entry.id
						)
						.sort((left, right) => left.position - right.position)
		).slice();
		targetSiblings.splice(Math.min(input.position, targetSiblings.length), 0, entry);
		const changes = [
			...(entry.parentId === input.parentId
				? []
				: oldSiblings.map((sibling, position) => ({
						id: sibling.id,
						parentId: entry.parentId,
						position
					}))),
			...targetSiblings.map((sibling, position) => ({
				id: sibling.id,
				parentId: input.parentId,
				position
			}))
		];
		await this.tree.persistOrder(actor, changes);
		return { ...entry, parentId: input.parentId, position: targetSiblings.indexOf(entry) };
	}

	private requireEntry(entries: readonly Note[], entryId: NoteId): Note {
		const entry = entries.find((candidate) => candidate.id === entryId);
		if (!entry) throw new NotFoundError('Project entry was not found');
		return entry;
	}

	private requireFolder(entries: readonly Note[], entryId: NoteId): Note {
		const entry = this.requireEntry(entries, entryId);
		if (entry.kind !== 'folder') throw new ValidationError('A parent must be a folder');
		return entry;
	}
}
