import {
	assembleProjectTree,
	decideProjectEntryMove,
	decideProjectDetails
} from '$lib/models/projects';
import type { ActorContext } from '$lib/models/identity';
import type {
	CreateFolderInput,
	CreateProjectInput,
	MoveProjectEntryInput,
	Project,
	ProjectId,
	ProjectTreeNode,
	RenameProjectInput,
	SetProjectSectionNumberingInput
} from '$lib/models/projects';
import { decideNoteCreation, type Note, type NoteId } from '$lib/models/notes';
import { NotFoundError, ValidationError } from '$lib/errors';
import type {
	ProjectRepository,
	ProjectTreeRepository
} from '$lib/server/repositories/projects/projects';
export class ProjectCatalog {
	constructor(
		private readonly projects: ProjectRepository,
		private readonly tree: ProjectTreeRepository
	) {}

	async create(actor: ActorContext, input: CreateProjectInput): Promise<Project> {
		const decision = decideProjectDetails(input);
		if (decision.kind === 'invalid') throw new ValidationError(decision.message);
		return this.projects.insert(actor, {
			...input,
			name: decision.name,
			description: decision.description
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
		const decision = decideProjectDetails(input);
		if (decision.kind === 'invalid') throw new ValidationError(decision.message);
		await this.get(actor, input.projectId);
		return this.projects.update(actor, {
			...input,
			name: decision.name,
			description: decision.description
		});
	}

	async archive(actor: ActorContext, projectId: ProjectId): Promise<Project> {
		await this.get(actor, projectId);
		return this.projects.archive(actor, projectId);
	}

	async setSectionNumberingDefault(
		actor: ActorContext,
		input: SetProjectSectionNumberingInput
	): Promise<Project> {
		await this.get(actor, input.projectId);
		return this.projects.setSectionNumberingDefault(actor, input.projectId, input.enabled ?? null);
	}

	async read(actor: ActorContext, projectId: ProjectId): Promise<readonly ProjectTreeNode[]> {
		await this.get(actor, projectId);
		return assembleProjectTree(await this.tree.list(actor, projectId));
	}

	async createFolder(actor: ActorContext, input: CreateFolderInput): Promise<Note> {
		const project = await this.get(actor, input.projectId);
		const entries = await this.tree.list(actor, input.projectId);
		const decision = decideNoteCreation(
			{
				id: input.id ?? (crypto.randomUUID() as NoteId),
				title: input.name,
				kind: 'folder',
				parentId: input.parentId
			},
			{
				project,
				parent: entries.find((entry) => entry.id === input.parentId) ?? null,
				siblingCount: entries.filter((entry) => entry.parentId === input.parentId).length
			},
			new Date().toISOString() as Note['createdAt']
		);
		if (decision.kind === 'invalid') {
			if (decision.code === 'NOT_FOUND') throw new NotFoundError(decision.message);
			throw new ValidationError(decision.message);
		}
		return this.tree.insertFolder(
			actor,
			{ ...input, id: decision.note.id, name: decision.note.title },
			decision.note.position
		);
	}

	async move(actor: ActorContext, input: MoveProjectEntryInput): Promise<Note> {
		await this.get(actor, input.projectId);
		const decision = decideProjectEntryMove(input, await this.tree.list(actor, input.projectId));
		if (decision.kind === 'invalid') {
			if (decision.code === 'NOT_FOUND') throw new NotFoundError(decision.message);
			throw new ValidationError(decision.message);
		}
		await this.tree.persistOrder(actor, decision.changes);
		return { ...decision.entry, parentId: decision.parentId, position: decision.position };
	}
}
