import type { ActorContext } from '$lib/models/identity';
import type {
	CreateProjectInput,
	Project,
	ProjectId,
	RenameProjectInput
} from '$lib/models/projects';
import type { Note, NoteId } from '$lib/models/notes';
import { ConflictError, NotFoundError } from '$lib/errors';
import type {
	ProjectRepository,
	ProjectTreeRepository
} from '$lib/server/repositories/projects/projects';
import {
	projectBuilder,
	testNow,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

export class InMemoryProjectRepository implements ProjectRepository, ProjectTreeRepository {
	projects: Project[] = [];
	constructor(private readonly entriesStore: { notes: Note[] } = { notes: [] }) {}
	get entries(): Note[] {
		return this.entriesStore.notes;
	}
	set entries(value: Note[]) {
		this.entriesStore.notes = value;
	}
	private nextProject = 100;
	snapshot(): () => void {
		const projects = structuredClone(this.projects);
		const entries = structuredClone(this.entries);
		return () => {
			this.projects = projects;
			this.entries = entries;
		};
	}

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
			id: input.id ?? testProjectId(this.nextProject++),
			userId: actor.userId,
			name: input.name,
			role: input.role ?? 'workspace',
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

	async findInbox(actor: ActorContext): Promise<Project | undefined> {
		return this.projects.find(
			(project) =>
				project.userId === actor.userId && project.role === 'inbox' && !project.archivedAt
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

	async setSectionNumberingDefault(
		actor: ActorContext,
		projectId: ProjectId,
		enabled: boolean | null
	): Promise<Project> {
		const current = this.projects.find(
			(project) =>
				project.id === projectId && project.userId === actor.userId && !project.archivedAt
		);
		if (!current) throw new NotFoundError('Project was not found');
		const updated = {
			...current,
			sectionNumberingDefault: enabled ?? undefined,
			updatedAt: testNow
		};
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

	async persistOrder(
		_actor: ActorContext,
		entries: readonly { id: NoteId; parentId?: NoteId; position: number }[]
	): Promise<void> {
		void _actor;
		const changes = new Map(entries.map((entry) => [entry.id, entry]));
		this.entries = this.entries.map((entry) => ({ ...entry, ...changes.get(entry.id) }));
	}
}
