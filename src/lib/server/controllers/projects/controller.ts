import type { NoteCatalog } from '$lib/server/services/notes/catalog';
import { decideNoteCreation } from '$lib/services/notes/creation';
import type { DateTime } from '$lib/models/workspace';
import { assembleProjectTree } from '$lib/services/projects/presentation';
import { decideProjectDetails } from '$lib/services/projects/details';
import { NotFoundError, ValidationError } from '$lib/errors';
import { mutationResource } from '$lib/services/workspace/commands';
import type { Note, NoteId } from '$lib/models/notes';
import type {
	ProjectMutationRequest,
	WorkspaceMutationResult
} from '$lib/models/workspace-mutations';
import type { WorkspaceMutationReceipts } from '$lib/server/services/workspace/mutation-receipts';
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
	RenameProjectOutput,
	SetProjectSectionNumberingInput,
	SetProjectSectionNumberingOutput
} from '$lib/models/projects';
import type {
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
	synchronize(actor: ActorContext, input: ProjectMutationRequest): Promise<WorkspaceMutationResult>;
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
	/** Set or clear the project's section-numbering default (`undefined` inherits the app default). */
	setSectionNumberingDefault(
		actor: ActorContext,
		input: SetProjectSectionNumberingInput
	): Promise<SetProjectSectionNumberingOutput>;
	/** Create a folder inside a project. */
	createFolder(actor: ActorContext, input: CreateFolderInput): Promise<CreateFolderOutput<Note>>;
	/** Move a note or folder to a new parent and position, atomically. */
	move(actor: ActorContext, input: MoveProjectEntryInput): Promise<MoveProjectEntryOutput<Note>>;
}

export interface ProjectsDependencies {
	syncMutations: Pick<WorkspaceMutationReceipts, 'prepare' | 'complete' | 'reject'>;
	syncRetry: 'database-only' | 'never';
	projectCreator: ProjectCreator;
	projectReader: ProjectReader;
	projectLister: ProjectLister;
	projectEditor: ProjectEditor;
	projectTreeReader: ProjectTreeReader;
	noteCreation: Pick<NoteCatalog, 'creationFacts' | 'insert'>;
	entryMover: ProjectEntryMover;
	transactionRunner: TransactionRunner;
}

export class Projects implements ProjectsController {
	async synchronize(
		actor: ActorContext,
		input: ProjectMutationRequest
	): Promise<WorkspaceMutationResult> {
		try {
			return await this.dependencies.transactionRunner.run(
				async () => {
					const target = mutationResource(input.command);
					const prepared = await this.dependencies.syncMutations.prepare(actor, input, target);
					if (prepared.kind === 'finished') return prepared.result;
					await this.applySynchronizedCommand(actor, input);
					return this.dependencies.syncMutations.complete(actor, input, target);
				},
				{ retry: this.dependencies.syncRetry }
			);
		} catch (error) {
			if (!(error instanceof Error)) throw error;
			return this.dependencies.syncMutations.reject(error);
		}
	}

	private async applySynchronizedCommand(
		actor: ActorContext,
		input: ProjectMutationRequest
	): Promise<void> {
		const command = input.command;

		switch (command.kind) {
			case 'createProject':
				await this.create(actor, command);
				break;
			case 'renameProject':
				await this.rename(actor, command);
				break;
			case 'archiveProject':
				await this.archive(actor, command);
				break;
			case 'projectNumbering':
				await this.setSectionNumberingDefault(actor, command);
				break;
			case 'createFolder':
				await this.createFolder(actor, command);
				break;
		}
	}

	constructor(private readonly dependencies: ProjectsDependencies) {}

	async list(actor: ActorContext): Promise<ListProjectsOutput> {
		return { projects: await this.dependencies.projectLister.list(actor) };
	}

	async get(actor: ActorContext, input: GetProjectInput): Promise<GetProjectOutput> {
		const [project, entries] = await Promise.all([
			this.dependencies.projectReader.get(actor, input.projectId),
			this.dependencies.projectTreeReader.readEntries(actor, input.projectId)
		]);
		return { project, tree: assembleProjectTree(entries) };
	}

	async create(actor: ActorContext, input: CreateProjectInput): Promise<CreateProjectOutput> {
		const details = decideProjectDetails(input);
		if (details.kind === 'invalid') throw new ValidationError(details.message);
		return {
			project: await this.dependencies.projectCreator.create(actor, {
				...input,
				name: details.name,
				description: details.description
			})
		};
	}

	async rename(actor: ActorContext, input: RenameProjectInput): Promise<RenameProjectOutput> {
		const details = decideProjectDetails(input);
		if (details.kind === 'invalid') throw new ValidationError(details.message);
		return {
			project: await this.dependencies.projectEditor.rename(actor, {
				...input,
				name: details.name,
				description: details.description
			})
		};
	}

	async archive(actor: ActorContext, input: ArchiveProjectInput): Promise<ArchiveProjectOutput> {
		return { project: await this.dependencies.projectEditor.archive(actor, input.projectId) };
	}

	async setSectionNumberingDefault(
		actor: ActorContext,
		input: SetProjectSectionNumberingInput
	): Promise<SetProjectSectionNumberingOutput> {
		return {
			project: await this.dependencies.projectEditor.setSectionNumberingDefault(actor, input)
		};
	}

	async createFolder(
		actor: ActorContext,
		input: CreateFolderInput
	): Promise<CreateFolderOutput<Note>> {
		const facts = await this.dependencies.noteCreation.creationFacts(actor, input);
		const decision = decideNoteCreation(
			{
				id: input.id ?? (crypto.randomUUID() as NoteId),
				title: input.name,
				parentId: input.parentId,
				kind: 'folder'
			},
			facts,
			new Date().toISOString() as DateTime
		);
		if (decision.kind === 'invalid') {
			if (decision.code === 'NOT_FOUND') throw new NotFoundError(decision.message);
			throw new ValidationError(decision.message);
		}
		return { folder: await this.dependencies.noteCreation.insert(actor, decision.note) };
	}

	async move(
		actor: ActorContext,
		input: MoveProjectEntryInput
	): Promise<MoveProjectEntryOutput<Note>> {
		return this.dependencies.transactionRunner.run(async () => ({
			entry: await this.dependencies.entryMover.move(actor, input)
		}));
	}
}
