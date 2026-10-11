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
import { NotFoundError } from '$lib/errors';
import type {
	ProjectRepository,
	ProjectTreeRepository
} from '$lib/server/repositories/projects/projects';
const requireProject = async (
	projects: ProjectRepository,
	actor: ActorContext,
	projectId: ProjectId
): Promise<Project> => {
	const project = await projects.findById(projectId);
	if (!project) throw new NotFoundError('Project was not found');
	return project;
};
export interface ProjectCreator {
	create(input: CreateProjectInput & ProjectDetails): Promise<Project>;
}
export class ProjectCreationService implements ProjectCreator {
	constructor(private readonly projects: ProjectRepository) {}

	async create(input: CreateProjectInput & ProjectDetails): Promise<Project> {
		return this.projects.insert(input);
	}
}
export interface ProjectReader {
	get(projectId: ProjectId): Promise<Project>;
}
export interface ProjectLister {
	list(): Promise<readonly Project[]>;
}
export class ProjectReadingService implements ProjectReader, ProjectLister {
	constructor(
		private readonly actor: ActorContext,
		private readonly projects: ProjectRepository
	) {}

	async get(projectId: ProjectId): Promise<Project> {
		const project = await this.projects.findById(projectId);
		if (!project) throw new NotFoundError('Project was not found');
		return project;
	}

	list(): Promise<readonly Project[]> {
		return this.projects.listActive();
	}
}
export interface ProjectEditor {
	rename(input: ProjectRename): Promise<Project>;
	setSectionNumberingDefault(input: SetProjectSectionNumberingInput): Promise<Project>;
}
export class ProjectEditingService implements ProjectEditor {
	constructor(
		private readonly actor: ActorContext,
		private readonly projects: ProjectRepository
	) {}

	async rename(input: ProjectRename): Promise<Project> {
		await requireProject(this.projects, this.actor, input.projectId);
		return this.projects.update(input);
	}

	async setSectionNumberingDefault(input: SetProjectSectionNumberingInput): Promise<Project> {
		await requireProject(this.projects, this.actor, input.projectId);
		return this.projects.setSectionNumberingDefault(input.projectId, input.enabled ?? null);
	}
}
export interface ProjectLifecycle {
	archive(projectId: ProjectId): Promise<Project>;
}
export class ProjectLifecycleService implements ProjectLifecycle {
	constructor(
		private readonly actor: ActorContext,
		private readonly projects: ProjectRepository
	) {}

	async archive(projectId: ProjectId): Promise<Project> {
		await requireProject(this.projects, this.actor, projectId);
		return this.projects.archive(projectId);
	}
}
export interface ProjectTreeReader {
	readEntries(projectId: ProjectId): Promise<readonly Note[]>;
}
export interface ProjectTreeWriter {
	readForMove(projectId: ProjectId): Promise<readonly Note[]>;
	persistOrder(
		entries: readonly { id: NoteId; parentId: NoteId | undefined; position: number }[]
	): Promise<void>;
}
export class ProjectTreeService implements ProjectTreeReader, ProjectTreeWriter {
	constructor(
		private readonly actor: ActorContext,
		private readonly projects: ProjectRepository,
		private readonly tree: ProjectTreeRepository
	) {}

	async readEntries(projectId: ProjectId): Promise<readonly Note[]> {
		await requireProject(this.projects, this.actor, projectId);
		return this.tree.list(projectId);
	}

	async readForMove(projectId: ProjectId): Promise<readonly Note[]> {
		const project = await this.projects.findForWrite(projectId);
		if (!project) throw new NotFoundError('Project was not found');
		return this.tree.list(projectId);
	}

	persistOrder(
		entries: readonly { id: NoteId; parentId: NoteId | undefined; position: number }[]
	): Promise<void> {
		return this.tree.persistOrder(entries);
	}
}
