import type { ActorContext } from '$lib/models/identity';
import type { CreateProjectInput, Project, ProjectId, ProjectRename } from '$lib/models/projects';
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
	constructor(
		private readonly actor: ActorContext,
		private readonly entriesStore: { notes: Note[] } = { notes: [] }
	) {}
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

	async insert(input: CreateProjectInput): Promise<Project> {
		if (
			this.projects.some(
				(project) =>
					project.userId === this.actor.userId &&
					!project.archivedAt &&
					project.name.toLowerCase() === input.name.toLowerCase()
			)
		)
			throw new ConflictError('An active project with this name already exists');
		if (
			input.role === 'inbox' &&
			this.projects.some(
				(project) =>
					project.userId === this.actor.userId && project.role === 'inbox' && !project.archivedAt
			)
		)
			throw new ConflictError('This workspace already has an active inbox');
		const project = projectBuilder({
			id: input.id ?? testProjectId(this.nextProject++),
			userId: this.actor.userId,
			name: input.name,
			role: input.role ?? 'workspace',
			description: input.description
		});
		this.projects.push(project);
		return project;
	}

	findForWrite(projectId: ProjectId): Promise<Project | undefined> {
		return this.findById(projectId);
	}

	async findById(projectId: ProjectId): Promise<Project | undefined> {
		return this.projects.find(
			(project) =>
				project.id === projectId && project.userId === this.actor.userId && !project.archivedAt
		);
	}

	async listActive(): Promise<readonly Project[]> {
		return this.projects.filter(
			(project) => project.userId === this.actor.userId && !project.archivedAt
		);
	}

	async update(input: ProjectRename): Promise<Project> {
		if (
			this.projects.some(
				(project) =>
					project.id !== input.projectId &&
					project.userId === this.actor.userId &&
					!project.archivedAt &&
					project.name.toLowerCase() === input.name.toLowerCase()
			)
		)
			throw new ConflictError('An active project with this name already exists');
		const current = (await this.findById(input.projectId))!;
		const updated = {
			...current,
			name: input.name,
			...(input.description !== undefined ? { description: input.description ?? undefined } : {}),
			updatedAt: testNow
		};
		this.projects = this.projects.map((project) => (project.id === updated.id ? updated : project));
		return updated;
	}

	async archive(projectId: ProjectId): Promise<Project> {
		const current = this.projects.find(
			(project) => project.id === projectId && project.userId === this.actor.userId
		)!;
		const updated = { ...current, archivedAt: testNow, updatedAt: testNow };
		this.projects = this.projects.map((project) => (project.id === updated.id ? updated : project));
		return updated;
	}

	async setSectionNumberingDefault(
		projectId: ProjectId,
		enabled: boolean | null
	): Promise<Project> {
		const current = this.projects.find(
			(project) =>
				project.id === projectId && project.userId === this.actor.userId && !project.archivedAt
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

	async list(projectId: ProjectId): Promise<readonly Note[]> {
		return this.entries
			.filter(
				(entry) =>
					entry.userId === this.actor.userId && entry.projectId === projectId && !entry.archivedAt
			)
			.sort((left, right) => left.position - right.position);
	}

	async persistOrder(
		entries: readonly { id: NoteId; parentId?: NoteId; position: number }[]
	): Promise<void> {
		const changes = new Map(entries.map((entry) => [entry.id, entry]));
		this.entries = this.entries.map((entry) => ({ ...entry, ...changes.get(entry.id) }));
	}
}
