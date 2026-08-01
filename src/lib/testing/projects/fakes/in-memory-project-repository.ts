import type { ActorContext } from '$lib/models/identity';
import type {
	CreateFolderInput,
	CreateProjectInput,
	Project,
	ProjectId,
	RenameProjectInput
} from '$lib/models/projects';
import type { Note, NoteId } from '$lib/models/notes';
import { ConflictError } from '$lib/errors';
import type {
	ProjectRepository,
	ProjectTreeRepository
} from '$lib/server/repositories/projects/projects';
import {
	noteBuilder,
	projectBuilder,
	testNoteId,
	testNow,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

export class InMemoryProjectRepository implements ProjectRepository, ProjectTreeRepository {
	projects: Project[] = [];
	entries: Note[] = [];
	private nextProject = 100;
	private nextEntry = 100;

	async insert(actor: ActorContext, input: CreateProjectInput): Promise<Project> {
		if (
			this.projects.some(
				(project) =>
					project.userId === actor.userId &&
					!project.archivedAt &&
					project.name.toLowerCase() === input.name.toLowerCase()
			)
		)
			throw new ConflictError('An active project with this name already exists');
		const project = projectBuilder({
			id: testProjectId(this.nextProject++),
			userId: actor.userId,
			name: input.name,
			description: input.description
		});
		this.projects.push(project);
		return project;
	}

	async findById(actor: ActorContext, projectId: ProjectId): Promise<Project | undefined> {
		return this.projects.find(
			(project) =>
				project.id === projectId && project.userId === actor.userId && !project.archivedAt
		);
	}

	async listActive(actor: ActorContext): Promise<readonly Project[]> {
		return this.projects.filter(
			(project) => project.userId === actor.userId && !project.archivedAt
		);
	}

	async findFirstActive(actor: ActorContext): Promise<Project | undefined> {
		return (await this.listActive(actor))[0];
	}

	async update(actor: ActorContext, input: RenameProjectInput): Promise<Project> {
		if (
			this.projects.some(
				(project) =>
					project.id !== input.projectId &&
					project.userId === actor.userId &&
					!project.archivedAt &&
					project.name.toLowerCase() === input.name.toLowerCase()
			)
		)
			throw new ConflictError('An active project with this name already exists');
		const current = (await this.findById(actor, input.projectId))!;
		const updated = { ...current, ...input, updatedAt: testNow };
		this.projects = this.projects.map((project) => (project.id === updated.id ? updated : project));
		return updated;
	}

	async archive(actor: ActorContext, projectId: ProjectId): Promise<Project> {
		const current = this.projects.find(
			(project) => project.id === projectId && project.userId === actor.userId
		)!;
		const updated = { ...current, archivedAt: testNow, updatedAt: testNow };
		this.projects = this.projects.map((project) => (project.id === updated.id ? updated : project));
		return updated;
	}

	async list(actor: ActorContext, projectId: ProjectId): Promise<readonly Note[]> {
		return this.entries
			.filter(
				(entry) =>
					entry.userId === actor.userId && entry.projectId === projectId && !entry.archivedAt
			)
			.sort((left, right) => left.position - right.position);
	}

	async insertFolder(
		actor: ActorContext,
		input: CreateFolderInput,
		position: number
	): Promise<Note> {
		const folder = noteBuilder({
			id: testNoteId(this.nextEntry++),
			userId: actor.userId,
			projectId: input.projectId,
			parentId: input.parentId,
			kind: 'folder',
			position,
			title: input.name
		});
		this.entries.push(folder);
		return folder;
	}

	async persistOrder(
		_actor: ActorContext,
		entries: readonly { id: NoteId; parentId?: NoteId; position: number }[]
	): Promise<void> {
		void _actor;
		const changes = new Map(entries.map((entry) => [entry.id, entry]));
		this.entries = this.entries.map((entry) => ({ ...entry, ...changes.get(entry.id) }));
	}
}
