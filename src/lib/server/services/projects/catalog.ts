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
	const project = await projects.findById(actor, projectId);
	if (!project) throw new NotFoundError('Project was not found');
	return project;
};
export interface ProjectCreator {
	create(actor: ActorContext, input: CreateProjectInput & ProjectDetails): Promise<Project>;
}
export class ProjectCreationService implements ProjectCreator {
	constructor(private readonly projects: ProjectRepository) {}

	async create(actor: ActorContext, input: CreateProjectInput & ProjectDetails): Promise<Project> {
		return this.projects.insert(actor, input);
	}
}
export interface ProjectReader {
	get(actor: ActorContext, projectId: ProjectId): Promise<Project>;
}
export interface ProjectLister {
	list(actor: ActorContext): Promise<readonly Project[]>;
}
export class ProjectReadingService implements ProjectReader, ProjectLister {
	constructor(private readonly projects: ProjectRepository) {}

	async get(actor: ActorContext, projectId: ProjectId): Promise<Project> {
		const project = await this.projects.findById(actor, projectId);
		if (!project) throw new NotFoundError('Project was not found');
		return project;
	}

	list(actor: ActorContext): Promise<readonly Project[]> {
		return this.projects.listActive(actor);
	}
}
export interface ProjectEditor {
	rename(actor: ActorContext, input: ProjectRename): Promise<Project>;
	setSectionNumberingDefault(
		actor: ActorContext,
		input: SetProjectSectionNumberingInput
	): Promise<Project>;
}
export class ProjectEditingService implements ProjectEditor {
	constructor(private readonly projects: ProjectRepository) {}

	async rename(actor: ActorContext, input: ProjectRename): Promise<Project> {
		await requireProject(this.projects, actor, input.projectId);
		return this.projects.update(actor, input);
	}

	async setSectionNumberingDefault(
		actor: ActorContext,
		input: SetProjectSectionNumberingInput
	): Promise<Project> {
		await requireProject(this.projects, actor, input.projectId);
		return this.projects.setSectionNumberingDefault(actor, input.projectId, input.enabled ?? null);
	}
}
export interface ProjectLifecycle {
	archive(actor: ActorContext, projectId: ProjectId): Promise<Project>;
}
export class ProjectLifecycleService implements ProjectLifecycle {
	constructor(private readonly projects: ProjectRepository) {}

	async archive(actor: ActorContext, projectId: ProjectId): Promise<Project> {
		await requireProject(this.projects, actor, projectId);
		return this.projects.archive(actor, projectId);
	}
}
export interface ProjectTreeReader {
	readEntries(actor: ActorContext, projectId: ProjectId): Promise<readonly Note[]>;
}
export interface ProjectTreeWriter {
	readForMove(actor: ActorContext, projectId: ProjectId): Promise<readonly Note[]>;
	persistOrder(
		actor: ActorContext,
		entries: readonly { id: NoteId; parentId: NoteId | undefined; position: number }[]
	): Promise<void>;
}
export class ProjectTreeService implements ProjectTreeReader, ProjectTreeWriter {
	constructor(
		private readonly projects: ProjectRepository,
		private readonly tree: ProjectTreeRepository
	) {}

	async readEntries(actor: ActorContext, projectId: ProjectId): Promise<readonly Note[]> {
		await requireProject(this.projects, actor, projectId);
		return this.tree.list(actor, projectId);
	}

	async readForMove(actor: ActorContext, projectId: ProjectId): Promise<readonly Note[]> {
		const project = await this.projects.findForWrite(actor, projectId);
		if (!project) throw new NotFoundError('Project was not found');
		return this.tree.list(actor, projectId);
	}

	persistOrder(
		actor: ActorContext,
		entries: readonly { id: NoteId; parentId: NoteId | undefined; position: number }[]
	): Promise<void> {
		return this.tree.persistOrder(actor, entries);
	}
}
