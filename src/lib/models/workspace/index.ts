export type Brand<T, Name extends string> = T & { readonly __brand: Name };

/** Capability-neutral contract for work that must commit or roll back as one unit. */
export interface AtomicOperation {
	run<T>(work: () => Promise<T>): Promise<T>;
}

type UserId = Brand<string, 'UserId'>;

type ProjectId = Brand<string, 'ProjectId'>;

type NoteId = Brand<string, 'NoteId'>;

type TodoId = Brand<string, 'TodoId'>;

type SourceAnchorId = Brand<string, 'SourceAnchorId'>;

type ProvenanceId = Brand<string, 'ProvenanceId'>;

type AgentRunId = Brand<string, 'AgentRunId'>;

export type DateTime = Brand<string, 'DateTime'>;

export type LocalDate = Brand<string, 'LocalDate'>;

type Url = Brand<string, 'Url'>;

type UserRole = 'USER' | 'ADMIN' | 'WAITING';

export interface PageRequest {
	readonly cursor?: string;
	readonly limit: number;
}

export interface Page<T> {
	readonly items: readonly T[];
	readonly nextCursor?: string;
}

interface ProseMirrorDocument {
	readonly type: 'doc';
	readonly content?: readonly Record<string, unknown>[];
}

type NoteKind = 'folder' | 'note' | 'skill';

type TodoStatus = 'backlog' | 'open' | 'in_progress' | 'done' | 'cancelled';

type TodoResponsibility = 'mine' | 'waiting_on';

type TodoPriority = 'low' | 'medium' | 'high';

type PromiseStrength = 'explicit' | 'implied' | 'tentative';

type PipelineKind = 'extract_promises' | 'relate' | 'reference' | 'agent' | 'memory';

type ProducerKind = 'user' | 'pipeline' | 'agent';

interface User {
	readonly id: UserId;
	readonly email: string;
	readonly displayName: string;
	readonly avatarUrl?: Url;
	readonly role: UserRole;
	readonly authProvider?: string;
	readonly authProviderId?: string;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

interface Project {
	readonly id: ProjectId;
	readonly userId: UserId;
	readonly name: string;
	readonly description?: string;
	readonly archivedAt?: DateTime;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

interface Note {
	readonly id: NoteId;
	readonly userId: UserId;
	readonly projectId: ProjectId;
	readonly parentId?: NoteId;
	readonly kind: NoteKind;
	readonly position: number;
	readonly title: string;
	readonly builtInKey?: string;
	readonly document: ProseMirrorDocument;
	readonly plainText: string;
	readonly currentRevision: number;
	readonly publishedRevision: number;
	readonly isPinned: boolean;
	readonly publishedAt?: DateTime;
	readonly archivedAt?: DateTime;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

type NoteSummary = Pick<
	Note,
	| 'id'
	| 'projectId'
	| 'parentId'
	| 'kind'
	| 'position'
	| 'title'
	| 'isPinned'
	| 'archivedAt'
	| 'createdAt'
	| 'updatedAt'
	| 'currentRevision'
>;

interface SourceAnchor {
	readonly id: SourceAnchorId;
	readonly noteId: NoteId;
	readonly nodeId?: string;
	readonly from?: number;
	readonly to?: number;
	readonly quote: string;
	readonly prefix?: string;
	readonly suffix?: string;
	readonly revision: number;
	readonly createdAt: DateTime;
}

interface Provenance {
	readonly id: ProvenanceId;
	readonly userId: UserId;
	readonly producerKind: ProducerKind;
	readonly producerName: string;
	readonly pipeline?: PipelineKind;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly runId?: AgentRunId;
	readonly model?: string;
	readonly metadata: Readonly<Record<string, unknown>>;
	readonly createdAt: DateTime;
}

interface Todo {
	readonly id: TodoId;
	readonly userId: UserId;
	readonly projectId: ProjectId;
	readonly title: string;
	readonly description?: string;
	readonly status: TodoStatus;
	readonly responsibility: TodoResponsibility;
	readonly priority?: TodoPriority;
	readonly category?: string;
	readonly waitingOn?: string;
	readonly dueDate?: LocalDate;
	readonly dueDateVerbatim?: string;
	readonly promiseStrength?: PromiseStrength;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly linkedNoteId?: NoteId;
	readonly provenanceId?: ProvenanceId;
	readonly completedAt?: DateTime;
	readonly deletedAt?: DateTime;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

interface Skill {
	readonly note: Note;
	readonly name: string;
	readonly slug?: string;
	readonly description: string;
	readonly triggerHints: readonly string[];
	readonly license?: string;
	readonly compatibility?: string;
	readonly metadata?: Readonly<Record<string, string>>;
	readonly allowImplicitInvocation?: boolean;
	readonly isEnabled: boolean;
}

type SkillSummary = Pick<
	Skill,
	'name' | 'slug' | 'description' | 'triggerHints' | 'allowImplicitInvocation' | 'isEnabled'
> & {
	readonly noteId: NoteId;
	readonly projectId?: ProjectId;
	readonly isPinned?: boolean;
};

type NoteRef = Pick<Note, 'id' | 'title'>;

interface TodoView {
	readonly todo: Todo;
	readonly sourceNote?: NoteRef;
	readonly originNote?: NoteRef;
	readonly anchor?: SourceAnchor;
	readonly provenance?: Provenance;
}

export interface TodayView {
	readonly overdue: readonly TodoView[];
	readonly dueToday: readonly TodoView[];
	readonly waitingOn: readonly TodoView[];
	readonly pendingSuggestionCount: number;
	readonly pinnedNotes: readonly NoteSummary[];
	readonly recentNotes: readonly NoteSummary[];
}

export interface ShellContext {
	readonly user: User;
	readonly projects: readonly Project[];
	readonly noteTree: readonly NoteSummary[];
	readonly skills: readonly SkillSummary[];
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
