export type Brand<T, Name extends string> = T & { readonly __brand: Name };

/** Capability-neutral contract for work that must commit or roll back as one unit. */
export interface AtomicOperation {
	run<T>(
		work: () => Promise<T>,
		options?: { readonly retry: 'database-only' | 'never' }
	): Promise<T>;
}

type ProjectId = Brand<string, 'ProjectId'>;

export type DateTime = Brand<string, 'DateTime'>;

export type LocalDate = Brand<string, 'LocalDate'>;

export interface PageRequest {
	readonly cursor?: string;
	readonly limit: number;
}

export interface Page<T> {
	readonly items: readonly T[];
	readonly nextCursor?: string;
}

/** The Today triage aggregate: overdue, due-today, and waiting-on todos assembled in parallel, plus what else needs attention. */
export interface TodayView<Task, Note> {
	readonly overdue: readonly Task[];
	readonly dueToday: readonly Task[];
	readonly waitingOn: readonly Task[];
	readonly pendingSuggestionCount: number;
	readonly pinnedNotes: readonly Note[];
	readonly recentNotes: readonly Note[];
}

/** Resolved records used by the browser and server to assemble the same Today view. */
export interface TodayFacts<Task, Note> {
	readonly today: LocalDate;
	readonly due: readonly Task[];
	readonly waiting: readonly Task[];
	readonly notes: readonly Note[];
	readonly pendingSuggestionCount: number;
}

/** Everything the app shell renders on every navigation: user, projects, note tree, skills, and pending review counts. */
export interface ShellContext<User, Project, Note, Skill> {
	readonly user: User;
	readonly projects: readonly Project[];
	readonly noteTree: readonly Note[];
	readonly skills: readonly Skill[];
	readonly pendingSuggestionCount: number;
	readonly pendingMemoryNotifications: readonly PendingMemoryNotification[];
}

interface PendingMemoryNotification {
	readonly projectId?: ProjectId;
	readonly label: string;
	readonly href: string;
	readonly count: number;
}

export interface GetTodayViewInput {
	readonly today: LocalDate;
}

export * from './app-context';
export * from './sidebar-width';
