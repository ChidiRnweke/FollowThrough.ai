import type { ToolResultReader } from '$lib/models/agent-tool-context';
import type { AgentToolInput } from '$lib/models/agent-tool-inputs';
import type { AgentPayload } from '$lib/models/agent/payload';
import type { ActorContext, User } from '$lib/models/identity';
import type { NoteSummary } from '$lib/models/notes';
import type { Project } from '$lib/models/projects';
import type { SkillSummary } from '$lib/models/skills';
import type { SyncCursor, SyncEtag, SyncObjectRead, SyncPage } from '$lib/models/sync';
import type { TodoView } from '$lib/models/todos';
import type {
	ShellContext as AggregateShellContext,
	TodayView as AggregateTodayView,
	GetTodayViewInput
} from '$lib/models/workspace';
import type {
	WorkspaceWriteCancellation,
	WorkspaceWriteRecovery
} from '$lib/models/workspace-mutations';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { WorkspaceResourceIdentity } from '$lib/models/workspace-sync';
import type { AgentToolPresentation } from '$lib/server/services/agent/runs/tool-views';
import type {
	SyncChangeReader,
	SyncObjectReader,
	SyncWriteRecovery
} from '$lib/server/services/workspace/contracts';
import type { AgentPayloadInspection } from '$lib/services/agent/payload';
import type { IMemoryPresentationService } from '$lib/services/memory/presentation';
import type { TodoPresentation } from '$lib/services/todos/presentation';
import type { TodayPresentation } from '$lib/services/workspace/today';

import type { NoteTreeReader } from '$lib/server/services/notes/catalog';

import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type { UserReader } from '$lib/server/services/identity/users';
import type { ProjectLister } from '$lib/server/services/projects/catalog';
import type { BuiltInSkillProvisioner } from '$lib/server/services/skills/built-ins';
import type { SkillFinder } from '$lib/server/services/skills/library';
import type { SuggestionExpirer, SuggestionLister } from '$lib/server/services/suggestions/inbox';
import type {
	TodoContextReader,
	TodoLister,
	WaitingOnFinder
} from '$lib/server/services/todos/catalog';

/**
 * Application boundary for the workspace shell: the context every screen needs (profile,
 * projects, note tree, skills, pending counts) and the today view. All reads fetch in
 * parallel because none depends on another's result.
 */
export interface WorkspaceController {
	pullChangePage(actor: ActorContext, since: SyncCursor): Promise<SyncPage<WorkspaceRecord>>;
	cancelMutation(
		actor: ActorContext,
		input: WorkspaceWriteCancellation
	): Promise<WorkspaceWriteRecovery>;
	readResource(
		actor: ActorContext,
		identity: WorkspaceResourceIdentity,
		etag: SyncEtag | null
	): Promise<SyncObjectRead<WorkspaceRecord>>;
	/** Load the shell context for the signed-in user. */
	getShellContext(actor: ActorContext): Promise<ShellContext>;
	/** Assemble the today view: overdue/due-today todos, waiting-on items, pending suggestion count, and notes. */
	getTodayView(actor: ActorContext, input: GetTodayViewInput): Promise<TodayView>;

	agentGetWorkspaceContext(
		actor: ActorContext,
		input: AgentToolInput<'get_workspace_context'>
	): Promise<AgentPayload>;
	agentGetTodayView(
		actor: ActorContext,
		input: AgentToolInput<'get_today_view'>
	): Promise<AgentPayload>;
}
export interface WorkspaceDependencies {
	readonly toolPresentation: AgentToolPresentation;
	readonly toolPayloads: AgentPayloadInspection;
	readonly toolResults: ToolResultReader;

	readonly todoPresentation: TodoPresentation;
	readonly memoryPresentation: IMemoryPresentationService;
	builtInSkills: Pick<BuiltInSkillProvisioner, 'ensure'>;
	transactionRunner: TransactionRunner;
	writeRecovery: SyncWriteRecovery;
	syncChanges: SyncChangeReader;
	syncObjects: SyncObjectReader;
	userReader: UserReader;
	noteTreeReader: NoteTreeReader;
	projectLister: ProjectLister;
	skillFinder: SkillFinder;
	suggestionLister: SuggestionLister;
	suggestionExpirer: SuggestionExpirer;
	todoLister: TodoLister;
	waitingOnFinder: WaitingOnFinder;
	todoContextReader: TodoContextReader;
}

export class Workspace implements WorkspaceController {
	constructor(
		private readonly todayPresentation: TodayPresentation,
		private readonly dependencies: WorkspaceDependencies
	) {}
	async pullChangePage(actor: ActorContext, since: SyncCursor) {
		if (since === '0')
			await this.dependencies.transactionRunner.run(() =>
				this.dependencies.builtInSkills.ensure(actor)
			);
		return this.dependencies.syncChanges.pullPage(actor, since);
	}
	cancelMutation(actor: ActorContext, input: WorkspaceWriteCancellation) {
		return this.dependencies.transactionRunner.run(
			() => this.dependencies.writeRecovery.cancel(actor, input),
			{ retry: 'database-only' }
		);
	}

	readResource(actor: ActorContext, identity: WorkspaceResourceIdentity, etag: SyncEtag | null) {
		return this.dependencies.syncObjects.read(actor, identity, etag);
	}
	async getShellContext(actor: ActorContext): Promise<ShellContext> {
		await this.dependencies.transactionRunner.run(() =>
			this.dependencies.builtInSkills.ensure(actor)
		);
		await this.dependencies.suggestionExpirer.expire(actor);
		const [user, projects, noteTree, skills, pendingSuggestions] = await Promise.all([
			this.dependencies.userReader.get(actor),
			this.dependencies.projectLister.list(actor),
			this.dependencies.noteTreeReader.list(actor),
			this.dependencies.skillFinder.listEnabled(actor),
			this.dependencies.suggestionLister.listByStatus(actor, 'proposed')
		]);
		return {
			user,
			projects,
			noteTree,
			skills,
			pendingSuggestionCount: pendingSuggestions.length,
			pendingMemoryNotifications: this.dependencies.memoryPresentation.pendingNotifications(
				projects,
				pendingSuggestions
			)
		};
	}
	async getTodayView(actor: ActorContext, input: GetTodayViewInput): Promise<TodayView> {
		await this.dependencies.suggestionExpirer.expire(actor);
		const [due, waiting, pendingSuggestionCount, notes] = await Promise.all([
			this.dependencies.todoLister.list(actor, {
				dueBefore: input.today,
				responsibility: 'mine'
			}),
			this.dependencies.waitingOnFinder.findWaitingOn(actor),
			this.dependencies.suggestionLister.countByStatus(actor, 'proposed'),
			this.dependencies.noteTreeReader.list(actor)
		]);
		const contexts = await this.dependencies.todoContextReader.readContexts(actor, [
			...due,
			...waiting
		]);
		const views = contexts.map((context) =>
			this.dependencies.todoPresentation.view(context.todo, context)
		);
		return this.todayPresentation.assembleToday({
			today: input.today,
			due: views.slice(0, due.length),
			waiting: views.slice(due.length),
			pendingSuggestionCount,
			notes
		});
	}

	async agentGetWorkspaceContext(
		actor: ActorContext,
		input: AgentToolInput<'get_workspace_context'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			const shell = await this.getShellContext(actor);
			return {
				user: this.dependencies.toolPresentation.projectUser(shell.user),
				projects: shell.projects.map((value) =>
					this.dependencies.toolPresentation.projectProject(value)
				),
				// Structure only — the agent calls get_note for content.
				noteTree: shell.noteTree.map((value) =>
					this.dependencies.toolPresentation.projectNoteSummary(value)
				),
				skills: shell.skills,
				pendingSuggestionCount: shell.pendingSuggestionCount
			};
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	async agentGetTodayView(
		actor: ActorContext,
		input: AgentToolInput<'get_today_view'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			return this.getTodayView(actor, input);
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
}

type ShellContext = AggregateShellContext<User, Project, NoteSummary, SkillSummary>;
type TodayView = AggregateTodayView<TodoView, NoteSummary>;
