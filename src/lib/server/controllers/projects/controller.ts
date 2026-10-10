import { NotFoundError, ValidationError } from '$lib/errors';
import type { ToolResultReader } from '$lib/models/agent-tool-context';
import type { AgentToolInput } from '$lib/models/agent-tool-inputs';
import type { AgentPayload } from '$lib/models/agent/payload';
import type { DateTime } from '$lib/models/workspace';
import type { AgentToolPresentation } from '$lib/server/services/agent/runs/tool-views';
import type { NoteCreator } from '$lib/server/services/notes/catalog';
import type { AgentPayloadInspection } from '$lib/services/agent/payload';
import type { NoteCreationRules } from '$lib/services/notes/lifecycle';
import type { ProjectDetailRules } from '$lib/services/projects/details';
import type { ProjectPlacement } from '$lib/services/projects/placement';
import type { ProjectTreePresentation } from '$lib/services/projects/presentation';
import type { WorkspaceCommandRules } from '$lib/services/workspace/commands';

import type { ActorContext } from '$lib/models/identity';
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
import type {
	ProjectCreator,
	ProjectEditor,
	ProjectLifecycle,
	ProjectLister,
	ProjectReader,
	ProjectTreeReader,
	ProjectTreeWriter
} from '$lib/server/services/projects/catalog';
import type { WorkspaceMutationGuard } from '$lib/server/services/workspace/mutation-receipts';

/**
 * Application boundary for projects and their folder tree: listing, loading, creating,
 * renaming, archiving, and moving entries. Creation and placement hold the project
 * lock while reading the tree and persisting its resolved changes.
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

	agentListProjects(
		actor: ActorContext,
		input: AgentToolInput<'list_projects'>
	): Promise<AgentPayload>;
	agentGetProject(actor: ActorContext, input: AgentToolInput<'get_project'>): Promise<AgentPayload>;
	agentCreateProject(
		actor: ActorContext,
		input: AgentToolInput<'create_project'>
	): Promise<AgentPayload>;
	agentRenameProject(
		actor: ActorContext,
		input: AgentToolInput<'rename_project'>
	): Promise<AgentPayload>;
	agentArchiveProject(
		actor: ActorContext,
		input: AgentToolInput<'archive_project'>
	): Promise<AgentPayload>;
	agentCreateFolder(
		actor: ActorContext,
		input: AgentToolInput<'create_folder'>
	): Promise<AgentPayload>;
	agentMoveProjectEntry(
		actor: ActorContext,
		input: AgentToolInput<'move_project_entry'>
	): Promise<AgentPayload>;
}

export interface ProjectsDependencies {
	readonly toolPresentation: AgentToolPresentation;
	readonly toolPayloads: AgentPayloadInspection;
	readonly toolResults: ToolResultReader;

	readonly noteCreationRules: NoteCreationRules;
	syncMutations: WorkspaceMutationGuard;
	syncRetry: 'database-only' | 'never';
	projectCreator: ProjectCreator;
	projectReader: ProjectReader;
	projectLister: ProjectLister;
	projectEditor: ProjectEditor;
	projectLifecycle: ProjectLifecycle;
	placement: ProjectPlacement;
	details: ProjectDetailRules;
	presentation: ProjectTreePresentation;
	projectTreeReader: ProjectTreeReader;
	noteCreation: NoteCreator;
	entryWriter: ProjectTreeWriter;
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
					const target = this.workspaceCommandRules.mutationResource(input.command);
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

	constructor(
		private readonly workspaceCommandRules: WorkspaceCommandRules,
		private readonly dependencies: ProjectsDependencies
	) {}

	async list(actor: ActorContext): Promise<ListProjectsOutput> {
		return { projects: await this.dependencies.projectLister.list(actor) };
	}

	async get(actor: ActorContext, input: GetProjectInput): Promise<GetProjectOutput> {
		const [project, entries] = await Promise.all([
			this.dependencies.projectReader.get(actor, input.projectId),
			this.dependencies.projectTreeReader.readEntries(actor, input.projectId)
		]);
		return { project, tree: this.dependencies.presentation.assemble(entries) };
	}

	async create(actor: ActorContext, input: CreateProjectInput): Promise<CreateProjectOutput> {
		const details = this.dependencies.details.decide(input);
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
		const details = this.dependencies.details.decide(input);
		if (details.kind === 'invalid') throw new ValidationError(details.message);
		return {
			project: await this.dependencies.projectEditor.rename(actor, {
				projectId: input.projectId,
				name: details.name,
				...(input.description !== undefined ? { description: details.description ?? null } : {})
			})
		};
	}

	async archive(actor: ActorContext, input: ArchiveProjectInput): Promise<ArchiveProjectOutput> {
		return { project: await this.dependencies.projectLifecycle.archive(actor, input.projectId) };
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
		return this.dependencies.transactionRunner.run(async () => {
			const facts = await this.dependencies.noteCreation.creationFacts(actor, input);
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
			return { folder: await this.dependencies.noteCreation.insert(actor, decision.note) };
		});
	}

	async move(
		actor: ActorContext,
		input: MoveProjectEntryInput
	): Promise<MoveProjectEntryOutput<Note>> {
		return this.dependencies.transactionRunner.run(async () => {
			const entries = await this.dependencies.entryWriter.readForMove(actor, input.projectId);
			const decision = this.dependencies.placement.decide(input, entries);
			if (decision.kind === 'invalid') {
				if (decision.code === 'NOT_FOUND') throw new NotFoundError(decision.message);
				throw new ValidationError(decision.message);
			}
			await this.dependencies.entryWriter.persistOrder(actor, decision.changes);
			return {
				entry: { ...decision.entry, parentId: decision.parentId, position: decision.position }
			};
		});
	}

	async agentListProjects(
		actor: ActorContext,
		input: AgentToolInput<'list_projects'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			return {
				projects: (await this.list(actor)).projects.map((value) =>
					this.dependencies.toolPresentation.projectProject(value)
				)
			};
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	async agentGetProject(
		actor: ActorContext,
		input: AgentToolInput<'get_project'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			return this.get(actor, input);
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	async agentCreateProject(
		actor: ActorContext,
		input: AgentToolInput<'create_project'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			return this.dependencies.toolPresentation.projectProject(
				(await this.create(actor, input)).project
			);
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	async agentRenameProject(
		actor: ActorContext,
		input: AgentToolInput<'rename_project'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			return this.dependencies.toolPresentation.projectProject(
				(await this.rename(actor, input)).project
			);
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	async agentArchiveProject(
		actor: ActorContext,
		input: AgentToolInput<'archive_project'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			return this.dependencies.toolPresentation.projectProject(
				(await this.archive(actor, input)).project
			);
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	async agentCreateFolder(
		actor: ActorContext,
		input: AgentToolInput<'create_folder'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			return this.dependencies.toolPresentation.projectNoteWrite(
				(await this.createFolder(actor, input)).folder
			);
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	async agentMoveProjectEntry(
		actor: ActorContext,
		input: AgentToolInput<'move_project_entry'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			return this.move(actor, input);
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
}
