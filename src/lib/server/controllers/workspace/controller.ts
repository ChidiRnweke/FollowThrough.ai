import { syncEtag } from '$lib/models/sync';
import type { WorkspaceCommandRules } from '$lib/services/workspace/commands';
import type { WorkspaceJournalReader } from '$lib/server/services/workspace/journal';
import type { WorkspaceResourceVersionReader } from '$lib/server/services/workspace/resource-versions';
import type { User } from '$lib/models/identity';
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
import type { SyncWriteRecovery } from '$lib/server/services/workspace/contracts';
import type { SyncObjectReader } from '$lib/server/services/workspace/sync-objects';
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
	pullChangePage(since: SyncCursor): Promise<SyncPage<WorkspaceRecord>>;
	cancelMutation(input: WorkspaceWriteCancellation): Promise<WorkspaceWriteRecovery>;
	readResource(
		identity: WorkspaceResourceIdentity,
		etag: SyncEtag | null
	): Promise<SyncObjectRead<WorkspaceRecord>>;
	/** Load the shell context for the signed-in user. */
	getShellContext(): Promise<ShellContext>;
	/** Assemble the today view: overdue/due-today todos, waiting-on items, pending suggestion count, and notes. */
	getTodayView(input: GetTodayViewInput): Promise<TodayView>;
}
export interface WorkspaceDependencies {
	readonly todoPresentation: TodoPresentation;
	readonly memoryPresentation: IMemoryPresentationService;
	builtInSkills: Pick<BuiltInSkillProvisioner, 'ensure'>;
	transactionRunner: TransactionRunner;
	writeRecovery: SyncWriteRecovery;
	syncChanges: WorkspaceJournalReader;
	resourceVersions: WorkspaceResourceVersionReader;
	resourceKeys: WorkspaceCommandRules;
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
	async pullChangePage(since: SyncCursor) {
		if (since === '0')
			await this.dependencies.transactionRunner.run(() => this.dependencies.builtInSkills.ensure());
		return this.dependencies.transactionRunner.run(
			async () => {
				const page = await this.dependencies.syncChanges.selectPage(since);
				const records: SyncPage<WorkspaceRecord>['records'][number][] = [];
				for (const change of page.changes) {
					const key = this.dependencies.resourceKeys.workspaceResourceKey(change.identity);
					const etag = syncEtag(change.version);
					const resource =
						change.kind === 'delete'
							? { kind: 'deleted' as const, etag }
							: await this.dependencies.resourceVersions.readVersion(change.identity, etag);
					records.push({ key, resource });
				}
				return { cursor: page.cursor, hasMore: page.hasMore, records };
			},
			{ retry: 'never', mode: 'read-only-snapshot' }
		);
	}
	cancelMutation(input: WorkspaceWriteCancellation) {
		return this.dependencies.transactionRunner.run(
			() => this.dependencies.writeRecovery.cancel(input),
			{ retry: 'database-only' }
		);
	}

	readResource(identity: WorkspaceResourceIdentity, etag: SyncEtag | null) {
		return this.dependencies.syncObjects.read(identity, etag);
	}
	async getShellContext(): Promise<ShellContext> {
		await this.dependencies.transactionRunner.run(() => this.dependencies.builtInSkills.ensure());
		await this.dependencies.suggestionExpirer.expire();
		const [user, projects, noteTree, skills, pendingSuggestions] = await Promise.all([
			this.dependencies.userReader.get(),
			this.dependencies.projectLister.list(),
			this.dependencies.noteTreeReader.list(),
			this.dependencies.skillFinder.listEnabled(),
			this.dependencies.suggestionLister.listByStatus('proposed')
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
	async getTodayView(input: GetTodayViewInput): Promise<TodayView> {
		await this.dependencies.suggestionExpirer.expire();
		const [due, waiting, pendingSuggestionCount, notes] = await Promise.all([
			this.dependencies.todoLister.list({
				dueBefore: input.today,
				responsibility: 'mine'
			}),
			this.dependencies.waitingOnFinder.findWaitingOn(),
			this.dependencies.suggestionLister.countByStatus('proposed'),
			this.dependencies.noteTreeReader.list()
		]);
		const contexts = await this.dependencies.todoContextReader.readContexts([...due, ...waiting]);
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
}

type ShellContext = AggregateShellContext<User, Project, NoteSummary, SkillSummary>;
type TodayView = AggregateTodayView<TodoView, NoteSummary>;
