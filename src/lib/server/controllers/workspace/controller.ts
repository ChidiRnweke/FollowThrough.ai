import type { TodoView } from '$lib/models/todos';
import type { SkillSummary } from '$lib/models/skills';
import type { NoteSummary } from '$lib/models/notes';
import type { User } from '$lib/models/identity';
import type { WorkspaceWriteCancellation } from '$lib/models/workspace-mutations';
import type { ActorContext } from '$lib/models/identity';
import type { SyncPage } from '$lib/models/sync';
import type { WorkspaceWriteRecovery } from '$lib/models/workspace-mutations';
import type { SyncWriteRecovery } from '$lib/server/services/workspace/contracts';
import type { SyncCursor, SyncEtag, SyncObjectRead } from '$lib/models/sync';
import type { WorkspaceResourceIdentity } from '$lib/models/workspace-sync';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { SyncChangeReader, SyncObjectReader } from '$lib/server/services/workspace/contracts';
import type {
	GetTodayViewInput,
	ShellContext as AggregateShellContext,
	TodayView as AggregateTodayView
} from '$lib/models/workspace';
import type { Project } from '$lib/models/projects';
import { pendingMemoryNotifications } from '$lib/services/memory/attention';
import { assembleToday } from '$lib/services/workspace/today';
import type { NoteTreeReader } from '$lib/server/services/notes/contracts';
import type { ProjectLister } from '$lib/server/services/projects/contracts';
import type { SkillFinder } from '$lib/server/services/skills/contracts';
import type {
	SuggestionExpirer,
	SuggestionLister
} from '$lib/server/services/suggestions/contracts';
import type {
	TodoLister,
	TodoViewAssembler,
	WaitingOnFinder
} from '$lib/server/services/todos/contracts';
import type { UserReader } from '$lib/server/services/identity/users';

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
}
export interface WorkspaceDependencies {
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
	todoViewAssembler: TodoViewAssembler;
}

export class Workspace implements WorkspaceController {
	constructor(private readonly dependencies: WorkspaceDependencies) {}
	pullChangePage(actor: ActorContext, since: SyncCursor) {
		return this.dependencies.syncChanges.pullPage(actor, since);
	}
	cancelMutation(actor: ActorContext, input: WorkspaceWriteCancellation) {
		return this.dependencies.writeRecovery.cancel(actor, input);
	}

	readResource(actor: ActorContext, identity: WorkspaceResourceIdentity, etag: SyncEtag | null) {
		return this.dependencies.syncObjects.read(actor, identity, etag);
	}
	async getShellContext(actor: ActorContext): Promise<ShellContext> {
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
			pendingMemoryNotifications: pendingMemoryNotifications(projects, pendingSuggestions)
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
		const views = await this.dependencies.todoViewAssembler.assemble(actor, [...due, ...waiting]);
		return assembleToday({
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
