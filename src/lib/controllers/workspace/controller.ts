import type { ActorContext, GetTodayViewInput, ShellContext, TodayView } from '$lib/models';
import type {
	NoteTreeReader,
	ProjectLister,
	SuggestionLister,
	TodoLister,
	TodoViewAssembler,
	UserReader,
	WaitingOnFinder
} from '$lib/services';

export interface WorkspaceController {
	getShellContext(actor: ActorContext): Promise<ShellContext>;
	getTodayView(actor: ActorContext, input: GetTodayViewInput): Promise<TodayView>;
}
export interface WorkspaceDependencies {
	userReader: UserReader;
	noteTreeReader: NoteTreeReader;
	projectLister: ProjectLister;
	suggestionLister: SuggestionLister;
	todoLister: TodoLister;
	waitingOnFinder: WaitingOnFinder;
	todoViewAssembler: TodoViewAssembler;
}
export class DefaultWorkspaceController implements WorkspaceController {
	constructor(private readonly dependencies: WorkspaceDependencies) {}
	async getShellContext(actor: ActorContext): Promise<ShellContext> {
		const [user, projects, noteTree, pendingSuggestionCount] = await Promise.all([
			this.dependencies.userReader.get(actor),
			this.dependencies.projectLister.list(actor),
			this.dependencies.noteTreeReader.list(actor),
			this.dependencies.suggestionLister.countByStatus(actor, 'proposed')
		]);
		return { user, projects, noteTree, pendingSuggestionCount };
	}
	async getTodayView(actor: ActorContext, input: GetTodayViewInput): Promise<TodayView> {
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
		const dueViews = views.slice(0, due.length);
		const recency = [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
		return {
			overdue: dueViews.filter((view) => (view.todo.dueDate ?? input.today) < input.today),
			dueToday: dueViews.filter((view) => view.todo.dueDate === input.today),
			waitingOn: views.slice(due.length),
			pendingSuggestionCount,
			pinnedNotes: notes.filter((note) => note.isPinned),
			recentNotes: recency.slice(0, 8)
		};
	}
}
