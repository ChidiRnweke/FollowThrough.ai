import type {
	ArtifactId,
	Confidence,
	ConversationId,
	LocalDate,
	NoteId,
	PipelineKind,
	ProjectId,
	SuggestionStatus,
	TemplateId,
	TodoId,
	TodoResponsibility,
	TodoStatus
} from './shared';
import type {
	Artifact,
	ArtifactView,
	Diagram,
	ExternalReference,
	Note,
	NoteRelationship,
	NoteSummary,
	Project,
	Provenance,
	Skill,
	SkillSummary,
	SkillUsage,
	SourceAnchor,
	Suggestion,
	Todo,
	TrustPolicy,
	User
} from './domain';

export type NoteRef = Pick<Note, 'id' | 'title'>;

export interface ProjectTreeNode {
	readonly entry: NoteSummary;
	readonly children: readonly ProjectTreeNode[];
}

export interface ProjectView {
	readonly project: Project;
	readonly tree: readonly ProjectTreeNode[];
}

export interface TodoView {
	readonly todo: Todo;
	readonly sourceNote?: NoteRef;
	readonly anchor?: SourceAnchor;
	readonly provenance?: Provenance;
}

export interface SuggestionView {
	readonly suggestion: Suggestion;
	readonly note?: NoteRef;
	readonly anchor?: SourceAnchor;
	readonly provenance: Provenance;
}

export interface BacklinkView {
	readonly relationship: NoteRelationship;
	readonly sourceNote: NoteRef;
	readonly targetNote: NoteRef;
}

export interface ReferenceView {
	readonly reference: ExternalReference;
	readonly anchor?: SourceAnchor;
}

export interface NoteView {
	readonly note: Note;
	readonly backlinks: readonly BacklinkView[];
	readonly references: readonly ReferenceView[];
	readonly diagrams: readonly Diagram[];
	readonly todos: readonly TodoView[];
	readonly pendingSuggestions: readonly SuggestionView[];
}

export interface TodayView {
	readonly overdue: readonly TodoView[];
	readonly dueToday: readonly TodoView[];
	readonly waitingOn: readonly TodoView[];
	readonly pendingSuggestionCount: number;
	readonly pinnedNotes: readonly NoteSummary[];
	readonly recentNotes: readonly NoteSummary[];
}

export interface SkillUsageView {
	readonly usage: SkillUsage;
	readonly contextNote?: NoteRef;
}

export interface SkillView {
	readonly skill: Skill;
	readonly usages: readonly SkillUsageView[];
}

export interface ShellContext {
	readonly user: User;
	readonly projects: readonly Project[];
	readonly noteTree: readonly NoteSummary[];
	readonly skills: readonly SkillSummary[];
	readonly pendingSuggestionCount: number;
}

export interface ConversationSummary {
	readonly id: ConversationId;
	readonly title?: string;
	readonly contextProjectId?: ProjectId;
	readonly contextNoteId?: NoteId;
	readonly createdAt: import('./shared').DateTime;
	readonly updatedAt: import('./shared').DateTime;
	readonly project?: Pick<Project, 'id' | 'name'>;
	readonly note?: NoteRef;
}

export interface GetNoteViewInput {
	readonly noteId: NoteId;
}

export interface GetTodayViewInput {
	readonly today: LocalDate;
}

export interface TodoListFilter {
	readonly projectId?: ProjectId;
	readonly status?: TodoStatus;
	readonly responsibility?: TodoResponsibility;
	readonly noteId?: NoteId;
	readonly dueBefore?: LocalDate;
}

export interface ListTodosOutput {
	readonly todos: readonly TodoView[];
}

export interface ListSuggestionsInput {
	readonly status: SuggestionStatus;
}

export interface SuggestionGroup {
	readonly note?: NoteRef;
	readonly suggestions: readonly SuggestionView[];
}

export interface ListSuggestionsOutput {
	readonly groups: readonly SuggestionGroup[];
}

export interface ListSkillsOutput {
	readonly skills: readonly SkillSummary[];
}

export interface GetSkillViewInput {
	readonly noteId: NoteId;
}

export interface GetTrustPoliciesOutput {
	readonly policies: readonly TrustPolicy[];
}

export interface CreateNoteInput {
	readonly projectId?: ProjectId;
	readonly title: string;
	readonly parentId?: NoteId;
}

export interface CreateProjectInput {
	readonly name: string;
	readonly description?: string;
}

export interface CreateProjectOutput {
	readonly project: Project;
}

export interface ListProjectsOutput {
	readonly projects: readonly Project[];
}

export interface GetProjectInput {
	readonly projectId: ProjectId;
}

export interface GetProjectOutput {
	readonly project: Project;
	readonly tree: readonly ProjectTreeNode[];
}

export interface CreateFolderInput {
	readonly projectId: ProjectId;
	readonly name: string;
	readonly parentId?: NoteId;
}

export interface CreateFolderOutput {
	readonly folder: Note;
}

export interface MoveProjectEntryInput {
	readonly projectId: ProjectId;
	readonly entryId: NoteId;
	readonly parentId?: NoteId;
	readonly position: number;
}

export interface MoveProjectEntryOutput {
	readonly entry: Note;
}

export interface RenameProjectInput {
	readonly projectId: ProjectId;
	readonly name: string;
	readonly description?: string;
}

export interface RenameProjectOutput {
	readonly project: Project;
}

export interface ArchiveProjectInput {
	readonly projectId: ProjectId;
}

export interface ArchiveProjectOutput {
	readonly project: Project;
}

export interface CreateNoteOutput {
	readonly note: Note;
}

export interface RenameNoteInput {
	readonly noteId: NoteId;
	readonly title: string;
}

export interface RenameNoteOutput {
	readonly note: Note;
}

export interface ArchiveNoteInput {
	readonly noteId: NoteId;
}

export interface ArchiveNoteOutput {
	readonly note: Note;
}

export interface UpdateTodoInput {
	readonly todoId: TodoId;
	readonly status?: TodoStatus;
	readonly title?: string;
	readonly description?: string;
	readonly dueDate?: LocalDate;
}

export interface UpdateTodoOutput {
	readonly todo: Todo;
}

export interface UpdateTrustPolicyInput {
	readonly pipeline: PipelineKind;
	readonly autoAcceptEnabled: boolean;
	readonly minimumConfidence?: Confidence;
}

export interface UpdateTrustPolicyOutput {
	readonly policy: TrustPolicy;
}

export interface ListArtifactsOutput {
	readonly artifacts: readonly ArtifactView[];
}

export interface GenerateDocumentInput {
	readonly projectId: ProjectId;
	readonly noteIds: NoteId[];
	readonly title: string;
	readonly format: 'docx' | 'pdf';
	readonly templateId?: TemplateId;
}

export interface GenerateDocumentOutput {
	readonly artifact: Artifact;
	readonly downloadUrl: string;
}

export interface InitiateTemplateUploadInput {
	readonly projectId: ProjectId;
	readonly name: string;
	readonly mediaType: string;
	readonly byteSize: number;
	readonly checksumSha256: string;
}

export interface InitiateTemplateUploadOutput {
	readonly templateId: TemplateId;
	readonly uploadUrl: string;
	readonly requiredHeaders: Record<string, string>;
}

export interface GetArtifactDownloadOutput {
	readonly url: string;
}

export interface RegenerateArtifactOutput {
	readonly artifact: Artifact;
	readonly downloadUrl: string;
}
