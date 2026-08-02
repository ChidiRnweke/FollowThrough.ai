import type { ActorContext } from '$lib/models/identity';
import type {
	ArchiveProjectInput,
	ArchiveProjectOutput,
	CreateFolderInput,
	CreateFolderOutput,
	CreateProjectInput,
	CreateProjectOutput,
	GetProjectInput,
	GetProjectOutput,
	ListProjectsOutput,
	MoveProjectEntryInput,
	MoveProjectEntryOutput,
	RenameProjectInput,
	RenameProjectOutput
} from '$lib/models/projects';
import type {
	FolderCreator,
	ProjectCreator,
	ProjectEditor,
	ProjectEntryMover,
	ProjectLister,
	ProjectReader,
	ProjectTreeReader
} from '$lib/server/services/projects/contracts';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';

/**
 * Application boundary for projects and their folder tree: listing, loading, creating,
 * renaming, archiving, and moving entries. The move is the only write that needs atomic
 * cross-entry bookkeeping, so it alone runs through the transaction runner.
 */
export interface ProjectsController {
	/** List the user's projects. */
	list(actor: ActorContext): Promise<ListProjectsOutput>;
	/** Load a project together with its full entry tree, fetched in parallel. */
	get(actor: ActorContext, input: GetProjectInput): Promise<GetProjectOutput>;
	/** Create a project. */
	create(actor: ActorContext, input: CreateProjectInput): Promise<CreateProjectOutput>;
	/** Rename a project. */
	rename(actor: ActorContext, input: RenameProjectInput): Promise<RenameProjectOutput>;
	/** Archive a project, removing it from the default workspace view. */
	archive(actor: ActorContext, input: ArchiveProjectInput): Promise<ArchiveProjectOutput>;
	/** Create a folder inside a project. */
	createFolder(actor: ActorContext, input: CreateFolderInput): Promise<CreateFolderOutput>;
	/** Move a note or folder to a new parent and position, atomically. */
	move(actor: ActorContext, input: MoveProjectEntryInput): Promise<MoveProjectEntryOutput>;
}

export interface ProjectsDependencies {
	projectCreator: ProjectCreator;
	projectReader: ProjectReader;
	projectLister: ProjectLister;
	projectEditor: ProjectEditor;
	projectTreeReader: ProjectTreeReader;
	folderCreator: FolderCreator;
	entryMover: ProjectEntryMover;
	transactionRunner: TransactionRunner;
}

export class Projects implements ProjectsController {
	constructor(private readonly dependencies: ProjectsDependencies) {}

	async list(actor: ActorContext): Promise<ListProjectsOutput> {
		return { projects: await this.dependencies.projectLister.list(actor) };
	}

	async get(actor: ActorContext, input: GetProjectInput): Promise<GetProjectOutput> {
		const [project, tree] = await Promise.all([
			this.dependencies.projectReader.get(actor, input.projectId),
			this.dependencies.projectTreeReader.read(actor, input.projectId)
		]);
		return { project, tree };
	}

	async create(actor: ActorContext, input: CreateProjectInput): Promise<CreateProjectOutput> {
		return { project: await this.dependencies.projectCreator.create(actor, input) };
	}

	async rename(actor: ActorContext, input: RenameProjectInput): Promise<RenameProjectOutput> {
		return { project: await this.dependencies.projectEditor.rename(actor, input) };
	}

	async archive(actor: ActorContext, input: ArchiveProjectInput): Promise<ArchiveProjectOutput> {
		return { project: await this.dependencies.projectEditor.archive(actor, input.projectId) };
	}

	async createFolder(actor: ActorContext, input: CreateFolderInput): Promise<CreateFolderOutput> {
		return { folder: await this.dependencies.folderCreator.createFolder(actor, input) };
	}

	async move(actor: ActorContext, input: MoveProjectEntryInput): Promise<MoveProjectEntryOutput> {
		return this.dependencies.transactionRunner.run(async () => ({
			entry: await this.dependencies.entryMover.move(actor, input)
		}));
	}
}
