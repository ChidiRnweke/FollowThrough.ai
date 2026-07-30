import type {
	ActorContext,
	GetTodayViewInput,
	PendingMemoryNotification,
	Project,
	ShellContext,
	Suggestion,
	TodayView
} from '$lib/models';
import type {
	NoteTreeReader,
	ProjectLister,
	SkillFinder,
	SuggestionLister,
	TodoLister,
	TodoViewAssembler,
	UserReader,
	WaitingOnFinder
} from '$lib/server/services';

export interface WorkspaceController {
	getShellContext(actor: ActorContext): Promise<ShellContext>;
	getTodayView(actor: ActorContext, input: GetTodayViewInput): Promise<TodayView>;
}
export interface WorkspaceDependencies {
	userReader: UserReader;
	noteTreeReader: NoteTreeReader;
	projectLister: ProjectLister;
	skillFinder: SkillFinder;
	suggestionLister: SuggestionLister;
	todoLister: TodoLister;
	waitingOnFinder: WaitingOnFinder;
	todoViewAssembler: TodoViewAssembler;
}

export const toPendingMemoryNotifications = (
	projects: readonly Project[],
	suggestions: readonly Suggestion[]
): readonly PendingMemoryNotification[] => {
	const counts = new Map<string | undefined, number>();
	for (const suggestion of suggestions) {
		if (suggestion.kind !== 'memory' || suggestion.status !== 'proposed') continue;
		const projectId = suggestion.payload.projectId;
		counts.set(projectId, (counts.get(projectId) ?? 0) + 1);
	}
	return [
		...(counts.get(undefined)
			? [{ label: 'Profile memory', href: '/profile', count: counts.get(undefined)! }]
			: []),
		...projects.flatMap((project) => {
			const count = counts.get(project.id);
			return count
				? [
						{
							projectId: project.id,
							label: project.name,
							href: `/projects/${project.id}/memory`,
							count
						}
					]
				: [];
		})
	];
};

export class Workspace implements WorkspaceController {
	constructor(private readonly dependencies: WorkspaceDependencies) {}
	async getShellContext(actor: ActorContext): Promise<ShellContext> {
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
			pendingMemoryNotifications: toPendingMemoryNotifications(projects, pendingSuggestions)
		};
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
			recentNotes: recency.slice(0, 5)
		};
	}
}
