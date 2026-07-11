import type {
	DateTime,
	DiagramId,
	LocalDate,
	Note,
	NoteId,
	ProvenanceId,
	SourceAnchorId,
	Suggestion,
	SuggestionId,
	Todo,
	TodoId,
	UserId
} from '../models';

export const demoIds = {
	user: '00000000-0000-4000-8000-000000000001' as UserId,
	note: '00000000-0000-4000-8000-000000000002' as NoteId,
	anchor: '00000000-0000-4000-8000-000000000003' as SourceAnchorId,
	provenance: '00000000-0000-4000-8000-000000000004' as ProvenanceId,
	suggestion: '00000000-0000-4000-8000-000000000005' as SuggestionId,
	todo: '00000000-0000-4000-8000-000000000006' as TodoId,
	diagram: '00000000-0000-4000-8000-000000000007' as DiagramId
};
export const demoNow = '2026-07-11T09:00:00.000Z' as DateTime;
export const demoNote: Note = {
	id: demoIds.note,
	userId: demoIds.user,
	kind: 'note',
	title: 'Client discovery',
	document: { type: 'doc', content: [] },
	plainText: 'I will send the design tomorrow.',
	currentRevision: 1,
	isPinned: true,
	createdAt: demoNow,
	updatedAt: demoNow
};
export const demoTodo: Todo = {
	id: demoIds.todo,
	userId: demoIds.user,
	title: 'Send the design',
	status: 'open',
	responsibility: 'mine',
	dueDate: '2026-07-12' as LocalDate,
	dueDateVerbatim: 'tomorrow',
	promiseStrength: 'explicit',
	sourceAnchorId: demoIds.anchor,
	provenanceId: demoIds.provenance,
	entityIds: [],
	createdAt: demoNow,
	updatedAt: demoNow
};
export const demoSuggestion: Suggestion = {
	id: demoIds.suggestion,
	userId: demoIds.user,
	noteId: demoIds.note,
	kind: 'todo',
	status: 'proposed',
	payload: {
		title: demoTodo.title,
		responsibility: 'mine',
		dueDate: demoTodo.dueDate,
		sourceAnchorId: demoIds.anchor,
		provenanceId: demoIds.provenance
	},
	provenanceId: demoIds.provenance,
	sourceAnchorId: demoIds.anchor,
	isAutoAccepted: false,
	createdAt: demoNow,
	updatedAt: demoNow
};
