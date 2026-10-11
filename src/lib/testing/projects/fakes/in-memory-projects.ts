import type { ActorContext } from '$lib/models/identity';
import type {
	CreateProjectInput,
	Project,
	ProjectId,
	ProjectDetails,
	ProjectRename,
	SetProjectSectionNumberingInput
} from '$lib/models/projects';
import type { Note, NoteId } from '$lib/models/notes';
import { ConflictError, NotFoundError } from '$lib/errors';
import type {
	ProjectCreator,
	ProjectEditor,
	ProjectTreeWriter,
	ProjectLister,
	ProjectReader,
	ProjectTreeReader
} from '$lib/server/services/projects/catalog';
import {
	projectBuilder,
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
		ProjectTreeWriter
{
	constructor(private readonly actor: ActorContext) {}
	projects: Project[] = [];
	entries: Note[] = [];
	private nextProject = 100;

	async create(input: CreateProjectInput & ProjectDetails): Promise<Project> {
		const name = input.name;
		if (
			this.projects.some(
				(project) =>
					project.userId === this.actor.userId &&
					!project.archivedAt &&
					project.name.toLowerCase() === name.toLowerCase()
			)
		)
			throw new ConflictError('An active project with this name already exists');
		const project = projectBuilder({
			id: input.id ?? testProjectId(this.nextProject++),
			userId: this.actor.userId,
			name,
			description: input.description
		});
		this.projects.push(project);
		return project;
	}

	async get(projectId: ProjectId): Promise<Project> {
		const project = this.projects.find(
			(candidate) => candidate.id === projectId && candidate.userId === this.actor.userId
		);
		if (!project) throw new NotFoundError('Project was not found');
		return project;
	}

	async list(): Promise<readonly Project[]> {
		return this.projects
			.filter((project) => project.userId === this.actor.userId && !project.archivedAt)
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	async rename(input: ProjectRename): Promise<Project> {
		const current = await this.get(input.projectId);
		const name = input.name;
		const updated: Project = {
			...current,
			name,
			...(input.description !== undefined ? { description: input.description ?? undefined } : {}),
			updatedAt: testNow
		};
		this.replaceProject(updated);
		return updated;
	}

	async archive(projectId: ProjectId): Promise<Project> {
		const current = await this.get(projectId);
		const updated = { ...current, archivedAt: testNow, updatedAt: testNow };
		this.replaceProject(updated);
		return updated;
	}

	async setSectionNumberingDefault(input: SetProjectSectionNumberingInput): Promise<Project> {
		const current = await this.get(input.projectId);
		const updated: Project = {
			...current,
			sectionNumberingDefault: input.enabled,
			updatedAt: testNow
		};
		this.replaceProject(updated);
		return updated;
	}

	async readEntries(projectId: ProjectId): Promise<readonly Note[]> {
		await this.get(projectId);
		const entries = this.entries
			.filter(
				(entry) =>
					entry.userId === this.actor.userId && entry.projectId === projectId && !entry.archivedAt
			)
			.sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
		return entries;
	}

	readForMove(projectId: ProjectId): Promise<readonly Note[]> {
		return this.readEntries(projectId);
	}

	async persistOrder(
		entries: readonly { id: NoteId; parentId: NoteId | undefined; position: number }[]
	): Promise<void> {
		const changes = new Map(entries.map((entry) => [entry.id, entry]));
		this.entries = this.entries.map((entry) => {
			const change = entry.userId === this.actor.userId ? changes.get(entry.id) : undefined;
			return change ? { ...entry, ...change } : entry;
		});
	}

	private replaceProject(project: Project): void {
		this.projects = this.projects.map((candidate) =>
			candidate.id === project.id ? project : candidate
		);
	}
}
