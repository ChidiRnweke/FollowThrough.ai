import { NotFoundError, ValidationError } from '$lib/errors';
import type { DateTime } from '$lib/models/workspace';
import type { NoteCreator } from '$lib/server/services/notes/catalog';
import type { NoteCreationRules } from '$lib/services/notes/lifecycle';
import type { ProjectDetailRules, ProjectPlacement } from '$lib/services/projects/rules';
import type { ProjectTreePresentation } from '$lib/services/projects/presentation';
import type { WorkspaceCommandRules } from '$lib/services/workspace/commands';

import type { Note, NoteId } from '$lib/models/notes';
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
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type {
	ProjectMutationRequest,
	WorkspaceMutationResult
} from '$lib/models/workspace-mutations';
import type { ProjectLibrary } from '$lib/server/services/projects/catalog';
import type { WorkspaceMutationGuard } from '$lib/server/services/workspace/mutation-receipts';

/**
 * Application boundary for projects and their folder tree: listing, loading, creating,
 * renaming, archiving, and moving entries. Creation and placement hold the project
 * lock while reading the tree and persisting its resolved changes.
 */
export interface ProjectsController {
	synchronize(input: ProjectMutationRequest): Promise<WorkspaceMutationResult>;
	/** List the user's projects. */
	list(): Promise<ListProjectsOutput>;
	/** Load a project together with its full entry tree, fetched in parallel. */
	get(input: GetProjectInput): Promise<GetProjectOutput>;
	/** Create a project. */
	create(input: CreateProjectInput): Promise<CreateProjectOutput>;
	/** Rename a project. */
	rename(input: RenameProjectInput): Promise<RenameProjectOutput>;
	/** Archive a project, removing it from the default workspace view. */
	archive(input: ArchiveProjectInput): Promise<ArchiveProjectOutput>;
	/** Set or clear the project's section-numbering default (`undefined` inherits the app default). */
	setSectionNumberingDefault(
		input: SetProjectSectionNumberingInput
	): Promise<SetProjectSectionNumberingOutput>;
	/** Create a folder inside a project. */
	createFolder(input: CreateFolderInput): Promise<CreateFolderOutput<Note>>;
	/** Move a note or folder to a new parent and position, atomically. */
	move(input: MoveProjectEntryInput): Promise<MoveProjectEntryOutput<Note>>;
}

export interface ProjectsDependencies {
	readonly noteCreationRules: NoteCreationRules;
	syncMutations: WorkspaceMutationGuard;
	syncRetry: 'database-only' | 'never';
	projects: ProjectLibrary;
	placement: ProjectPlacement;
	details: ProjectDetailRules;
	presentation: ProjectTreePresentation;
	noteCreation: NoteCreator;
	transactionRunner: TransactionRunner;
}

export class Projects implements ProjectsController {
	async synchronize(input: ProjectMutationRequest): Promise<WorkspaceMutationResult> {
		try {
			return await this.dependencies.transactionRunner.run(
				async () => {
					const target = this.workspaceCommandRules.mutationResource(input.command);
					const prepared = await this.dependencies.syncMutations.prepare(input, {
						identity: target,
						key: this.workspaceCommandRules.workspaceResourceKey(target)
					});
					if (prepared.kind === 'finished') return prepared.result;
					await this.applySynchronizedCommand(input);
					return this.dependencies.syncMutations.complete(input, target);
				},
				{ retry: this.dependencies.syncRetry }
			);
		} catch (error) {
			if (!(error instanceof Error)) throw error;
			return this.dependencies.syncMutations.reject(error);
		}
	}

	private async applySynchronizedCommand(input: ProjectMutationRequest): Promise<void> {
		const command = input.command;

		switch (command.kind) {
			case 'createProject':
				await this.create(command);
				break;
			case 'renameProject':
				await this.rename(command);
				break;
			case 'archiveProject':
				await this.archive(command);
				break;
			case 'projectNumbering':
				await this.setSectionNumberingDefault(command);
				break;
			case 'createFolder':
				await this.createFolder(command);
				break;
		}
	}

	constructor(
		private readonly workspaceCommandRules: WorkspaceCommandRules,
		private readonly dependencies: ProjectsDependencies
	) {}

	async list(): Promise<ListProjectsOutput> {
		return { projects: await this.dependencies.projects.list() };
	}

	async get(input: GetProjectInput): Promise<GetProjectOutput> {
		const [project, entries] = await Promise.all([
			this.dependencies.projects.get(input.projectId),
			this.dependencies.projects.readEntries(input.projectId)
		]);
		return { project, tree: this.dependencies.presentation.assemble(entries) };
	}

	async create(input: CreateProjectInput): Promise<CreateProjectOutput> {
		const details = this.dependencies.details.decideDetails(input);
		if (details.kind === 'invalid') throw new ValidationError(details.message);
		return {
			project: await this.dependencies.projects.create({
				...input,
				name: details.name,
				description: details.description
			})
		};
	}

	async rename(input: RenameProjectInput): Promise<RenameProjectOutput> {
		const details = this.dependencies.details.decideDetails(input);
		if (details.kind === 'invalid') throw new ValidationError(details.message);
		return {
			project: await this.dependencies.projects.rename({
				projectId: input.projectId,
				name: details.name,
				...(input.description !== undefined ? { description: details.description ?? null } : {})
			})
		};
	}

	async archive(input: ArchiveProjectInput): Promise<ArchiveProjectOutput> {
		return { project: await this.dependencies.projects.archive(input.projectId) };
	}

	async setSectionNumberingDefault(
		input: SetProjectSectionNumberingInput
	): Promise<SetProjectSectionNumberingOutput> {
		return {
			project: await this.dependencies.projects.setSectionNumberingDefault(input)
		};
	}

	async createFolder(input: CreateFolderInput): Promise<CreateFolderOutput<Note>> {
		return this.dependencies.transactionRunner.run(async () => {
			const facts = await this.dependencies.noteCreation.creationFacts(input);
			const decision = this.dependencies.noteCreationRules.decideCreation(
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
			return { folder: await this.dependencies.noteCreation.insert(decision.note) };
		});
	}

	async move(input: MoveProjectEntryInput): Promise<MoveProjectEntryOutput<Note>> {
		return this.dependencies.transactionRunner.run(async () => {
			const entries = await this.dependencies.projects.readForMove(input.projectId);
			const decision = this.dependencies.placement.decideMove(input, entries);
			if (decision.kind === 'invalid') {
				if (decision.code === 'NOT_FOUND') throw new NotFoundError(decision.message);
				throw new ValidationError(decision.message);
			}
			await this.dependencies.projects.persistOrder(decision.changes);
			return {
				entry: { ...decision.entry, parentId: decision.parentId, position: decision.position }
			};
		});
	}
}
