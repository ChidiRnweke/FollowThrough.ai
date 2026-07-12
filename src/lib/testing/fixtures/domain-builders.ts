import type {
	ActorContext,
	DateTime,
	Note,
	NoteId,
	Project,
	ProjectId,
	ProvenanceId,
	SourceAnchor,
	SourceAnchorId,
	SuggestionId,
	Todo,
	TodoId,
	TodoSuggestion,
	UserId
} from '$lib/models';

const id = (kind: number, value: number): string =>
	`00000000-0000-4000-${String(kind).padStart(4, '0')}-${String(value).padStart(12, '0')}`;

export const testNow = '2026-07-11T09:00:00.000Z' as DateTime;

export const testActor = (value = 1): ActorContext => ({ userId: id(1, value) as UserId });
export const testProjectId = (value = 1): ProjectId => id(2, value) as ProjectId;
export const testNoteId = (value = 1): NoteId => id(3, value) as NoteId;
export const testSuggestionId = (value = 1): SuggestionId => id(4, value) as SuggestionId;
export const testTodoId = (value = 1): TodoId => id(5, value) as TodoId;
export const testProvenanceId = (value = 1): ProvenanceId => id(6, value) as ProvenanceId;
export const testAnchorId = (value = 1): SourceAnchorId => id(7, value) as SourceAnchorId;

export const projectBuilder = (overrides: Partial<Project> = {}): Project => ({
	id: testProjectId(),
	userId: testActor().userId,
	name: 'Project Alpha',
	createdAt: testNow,
	updatedAt: testNow,
	...overrides
});

export const noteBuilder = (overrides: Partial<Note> = {}): Note => ({
	id: testNoteId(),
	userId: testActor().userId,
	projectId: testProjectId(),
	kind: 'note',
	position: 0,
	title: 'Architecture note',
	document: { type: 'doc', content: [] },
	plainText: '',
	currentRevision: 1,
	isPinned: false,
	createdAt: testNow,
	updatedAt: testNow,
	...overrides
});

export const todoBuilder = (overrides: Partial<Todo> = {}): Todo => ({
	id: testTodoId(),
	userId: testActor().userId,
	projectId: testProjectId(),
	title: 'Send the design',
	status: 'open',
	responsibility: 'mine',
	createdAt: testNow,
	updatedAt: testNow,
	...overrides
});

export const suggestionBuilder = (overrides: Partial<TodoSuggestion> = {}): TodoSuggestion => ({
	id: testSuggestionId(),
	userId: testActor().userId,
	noteId: testNoteId(),
	kind: 'todo',
	status: 'proposed',
	payload: {
		projectId: testProjectId(),
		title: 'Send the design',
		responsibility: 'mine'
	},
	provenanceId: testProvenanceId(),
	sourceAnchorId: testAnchorId(),
	isAutoAccepted: false,
	createdAt: testNow,
	updatedAt: testNow,
	...overrides
});

export const anchorBuilder = (overrides: Partial<SourceAnchor> = {}): SourceAnchor => ({
	id: testAnchorId(),
	noteId: testNoteId(),
	from: 0,
	to: 4,
	quote: 'Send',
	revision: 1,
	createdAt: testNow,
	...overrides
});
