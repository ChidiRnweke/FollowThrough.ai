import type {
	ActorContext,
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
} from '$lib/models';
import type {
	FolderCreator,
	ProjectCreator,
	ProjectEditor,
	ProjectEntryMover,
	ProjectLister,
	ProjectReader,
	ProjectTreeReader
} from '$lib/server/services';
import type { AtomicOperation as TransactionRunner } from '$lib/utils';

export interface ProjectsController {
	list(actor: ActorContext): Promise<ListProjectsOutput>;
	get(actor: ActorContext, input: GetProjectInput): Promise<GetProjectOutput>;
	create(actor: ActorContext, input: CreateProjectInput): Promise<CreateProjectOutput>;
	rename(actor: ActorContext, input: RenameProjectInput): Promise<RenameProjectOutput>;
	archive(actor: ActorContext, input: ArchiveProjectInput): Promise<ArchiveProjectOutput>;
	createFolder(actor: ActorContext, input: CreateFolderInput): Promise<CreateFolderOutput>;
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
