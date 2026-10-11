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

export interface ProjectCreator {
	create(input: CreateProjectInput & ProjectDetails): Promise<Project>;
}
export interface ProjectReader {
	get(projectId: ProjectId): Promise<Project>;
}
export interface ProjectLister {
	list(): Promise<readonly Project[]>;
}
export interface ProjectEditor {
	rename(input: ProjectRename): Promise<Project>;
	setSectionNumberingDefault(input: SetProjectSectionNumberingInput): Promise<Project>;
}
export interface ProjectLifecycle {
	archive(projectId: ProjectId): Promise<Project>;
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
/** Everything the projects controller needs from the project catalog. */
export interface ProjectLibrary
	extends
		ProjectCreator,
		ProjectReader,
		ProjectLister,
		ProjectEditor,
		ProjectLifecycle,
		ProjectTreeReader,
		ProjectTreeWriter {}

/** Creates, reads, edits, archives and orders the entry tree of a user's projects. */
export class ProjectCatalog implements ProjectLibrary {
	constructor(
		private readonly projects: ProjectRepository,
		private readonly tree: ProjectTreeRepository
	) {}

	create(input: CreateProjectInput & ProjectDetails): Promise<Project> {
		return this.projects.insert(input);
	}

	get(projectId: ProjectId): Promise<Project> {
		return this.require(projectId);
	}

	list(): Promise<readonly Project[]> {
		return this.projects.listActive();
	}

	async rename(input: ProjectRename): Promise<Project> {
		await this.require(input.projectId);
		return this.projects.update(input);
	}

	async setSectionNumberingDefault(input: SetProjectSectionNumberingInput): Promise<Project> {
		await this.require(input.projectId);
		return this.projects.setSectionNumberingDefault(input.projectId, input.enabled ?? null);
	}

	async archive(projectId: ProjectId): Promise<Project> {
		await this.require(projectId);
		return this.projects.archive(projectId);
	}

	async readEntries(projectId: ProjectId): Promise<readonly Note[]> {
		await this.require(projectId);
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

	private async require(projectId: ProjectId): Promise<Project> {
		const project = await this.projects.findById(projectId);
		if (!project) throw new NotFoundError('Project was not found');
		return project;
	}
}
