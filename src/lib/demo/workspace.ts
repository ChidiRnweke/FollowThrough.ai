import type {
	BacklinkView,
	Confidence,
	DateTime,
	Diagram,
	DiagramId,
	ExternalReference,
	LocalDate,
	Note,
	NoteId,
	NoteRef,
	NoteRelationship,
	NoteSummary,
	NoteView,
	Provenance,
	ProvenanceId,
	ReferenceId,
	RelationshipId,
	ShellContext,
	Skill,
	SkillSummary,
	SkillUsageId,
	SkillView,
	SourceAnchor,
	SourceAnchorId,
	Suggestion,
	SuggestionGroup,
	SuggestionId,
	SuggestionView,
	TodayView,
	Todo,
	TodoId,
	TodoView,
	TrustPolicy,
	Url,
	User
} from '../models';
import { demoIds, demoNote, demoNow, demoSuggestion, demoTodo } from '../factories/demo-fixtures';

const uuid = (block: number, n: number): string =>
	`00000000-0000-4000-9${String(block).padStart(3, '0')}-${String(n).padStart(12, '0')}`;
const dt = (value: string): DateTime => value as DateTime;
const ld = (value: string): LocalDate => value as LocalDate;

export const demoToday: LocalDate = ld('2026-07-11');

export const demoUser: User = {
	id: demoIds.user,
	email: 'architect@example.com',
	displayName: 'Demo Architect',
	createdAt: demoNow,
	updatedAt: demoNow
};

const noteId = (n: number): NoteId => uuid(2, n) as NoteId;
const makeNote = (id: NoteId, title: string, overrides: Partial<Note> = {}): Note => ({
	id,
	userId: demoIds.user,
	projectId: demoIds.project,
	kind: 'note',
	position: 0,
	title,
	document: { type: 'doc', content: [] },
	plainText: '',
	currentRevision: 1,
	isPinned: false,
	createdAt: demoNow,
	updatedAt: demoNow,
	...overrides
});
const projectNote = makeNote(noteId(1), 'Northwind integration platform', {
	isPinned: true,
	plainText: 'Engagement overview for the Northwind integration platform.'
});
const kickoffNote = makeNote(noteId(2), 'Kickoff meeting — 1 Jul', {
	parentId: projectNote.id,
	plainText: 'Jan will send the API spec by Wednesday. We agreed on weekly checkpoints.',
	updatedAt: dt('2026-07-01T15:00:00.000Z')
});
const paragraph = (text: string) => ({
	type: 'paragraph',
	content: [{ type: 'text', text }]
});
const workshopNote = makeNote(noteId(3), 'API workshop — 9 Jul', {
	parentId: projectNote.id,
	plainText: 'I will send the revised API spec by Friday. Security review follow-up pending.',
	document: {
		type: 'doc',
		content: [
			paragraph('Walked through the draft API with Jan and the Northwind team.'),
			paragraph('I will send the revised API spec by Friday.'),
			{ type: 'todoNode', attrs: { todoId: uuid(5, 2) } },
			paragraph('Security review follow-up is still pending on our side.')
		]
	},
	updatedAt: dt('2026-07-09T16:30:00.000Z')
});
const decisionNote = makeNote(noteId(4), 'Integration architecture decision', {
	parentId: projectNote.id,
	plainText: 'We will adopt asynchronous messaging for order flows through the Order Gateway.',
	updatedAt: dt('2026-07-10T11:00:00.000Z')
});
const marchDecisionNote = makeNote(noteId(5), 'Decision — synchronous REST (March)', {
	parentId: projectNote.id,
	plainText: 'March decision: expose order flows via synchronous REST endpoints.',
	createdAt: dt('2026-03-12T10:00:00.000Z'),
	updatedAt: dt('2026-03-12T10:00:00.000Z')
});
const readingNote = makeNote(noteId(6), 'Reading list', {
	plainText: 'Articles and references to read.'
});
const adrSkillNote = makeNote(noteId(7), 'ADR template', {
	kind: 'skill',
	plainText: 'How I write architecture decision records: context, decision, consequences.'
});
export const demoNotes: readonly Note[] = [
	demoNote,
	projectNote,
	kickoffNote,
	workshopNote,
	decisionNote,
	marchDecisionNote,
	readingNote,
	adrSkillNote
];
const toSummary = (note: Note): NoteSummary => ({
	id: note.id,
	projectId: note.projectId,
	kind: note.kind,
	position: note.position,
	title: note.title,
	isPinned: note.isPinned,
	updatedAt: note.updatedAt,
	...(note.parentId !== undefined ? { parentId: note.parentId } : {}),
	...(note.archivedAt !== undefined ? { archivedAt: note.archivedAt } : {})
});
export const demoNoteSummaries: readonly NoteSummary[] = demoNotes.map(toSummary);
const noteRef = (note: Note): NoteRef => ({ id: note.id, title: note.title });

const anchorId = (n: number): SourceAnchorId => uuid(3, n) as SourceAnchorId;
const makeAnchor = (id: SourceAnchorId, noteId: NoteId, quote: string): SourceAnchor => ({
	id,
	noteId,
	quote,
	revision: 1,
	createdAt: demoNow
});
const specAnchor = makeAnchor(
	anchorId(1),
	workshopNote.id,
	'I will send the revised API spec by Friday.'
);
const waitingAnchor = makeAnchor(
	anchorId(2),
	kickoffNote.id,
	'Jan will send the API spec by Wednesday.'
);
const decisionAnchor = makeAnchor(
	anchorId(3),
	decisionNote.id,
	'We will adopt asynchronous messaging for order flows.'
);

const provenanceId = (n: number): ProvenanceId => uuid(4, n) as ProvenanceId;
const makeProvenance = (
	id: ProvenanceId,
	pipeline: Provenance['pipeline'],
	producerName: string,
	sourceAnchorId?: SourceAnchorId
): Provenance => ({
	id,
	userId: demoIds.user,
	producerKind: 'pipeline',
	producerName,
	metadata: {},
	createdAt: demoNow,
	...(pipeline !== undefined ? { pipeline } : {}),
	...(sourceAnchorId !== undefined ? { sourceAnchorId } : {})
});
const extractProvenance = makeProvenance(
	provenanceId(1),
	'extract_promises',
	'Extract Promises',
	specAnchor.id
);
const relateProvenance = makeProvenance(provenanceId(2), 'relate', 'Relate', decisionAnchor.id);
const referenceProvenance = makeProvenance(
	provenanceId(3),
	'reference',
	'Reference',
	decisionAnchor.id
);
const agentProvenance: Provenance = {
	...makeProvenance(provenanceId(4), 'agent', 'Agent'),
	producerKind: 'agent'
};

const todoId = (n: number): TodoId => uuid(5, n) as TodoId;
const makeTodo = (id: TodoId, title: string, overrides: Partial<Todo> = {}): Todo => ({
	id,
	userId: demoIds.user,
	projectId: demoIds.project,
	title,
	status: 'open',
	responsibility: 'mine',
	createdAt: demoNow,
	updatedAt: demoNow,
	...overrides
});
const overdueTodo = makeTodo(todoId(1), 'Follow up on security review', {
	dueDate: ld('2026-07-08'),
	sourceAnchorId: specAnchor.id,
	provenanceId: extractProvenance.id,
	promiseStrength: 'explicit'
});
const dueTodayTodo = makeTodo(todoId(2), 'Send revised API spec', {
	dueDate: demoToday,
	dueDateVerbatim: 'by Friday',
	sourceAnchorId: specAnchor.id,
	provenanceId: extractProvenance.id,
	promiseStrength: 'explicit'
});
const waitingTodo = makeTodo(todoId(3), 'Jan to send the API spec', {
	responsibility: 'waiting_on',
	waitingOn: 'Jan Peeters',
	dueDate: ld('2026-07-09'),
	dueDateVerbatim: 'by Wednesday',
	sourceAnchorId: waitingAnchor.id,
	provenanceId: extractProvenance.id,
	promiseStrength: 'explicit'
});
const draftTodo = makeTodo(todoId(4), 'Draft integration architecture', { status: 'in_progress' });
const demoEnvTodo = makeTodo(todoId(5), 'Set up demo environment', { status: 'in_progress' });
const brokerTodo = makeTodo(todoId(6), 'Evaluate event broker options', { status: 'backlog' });
const agendaTodo = makeTodo(todoId(7), 'Prepare kickoff agenda', {
	status: 'done',
	completedAt: dt('2026-06-30T12:00:00.000Z')
});
const minutesTodo = makeTodo(todoId(8), 'Share meeting minutes', {
	status: 'done',
	completedAt: dt('2026-07-02T09:00:00.000Z')
});
const spikeTodo = makeTodo(todoId(9), 'Spike on legacy adapter', { status: 'cancelled' });
export const demoTodos: readonly Todo[] = [
	demoTodo,
	overdueTodo,
	dueTodayTodo,
	waitingTodo,
	draftTodo,
	demoEnvTodo,
	brokerTodo,
	agendaTodo,
	minutesTodo,
	spikeTodo
];

const anchorsById = new Map(
	[specAnchor, waitingAnchor, decisionAnchor, { ...specAnchor, id: demoIds.anchor }].map(
		(anchor) => [anchor.id, anchor]
	)
);
const provenancesById = new Map(
	[
		extractProvenance,
		relateProvenance,
		referenceProvenance,
		agentProvenance,
		{ ...extractProvenance, id: demoIds.provenance }
	].map((provenance) => [provenance.id, provenance])
);
const notesById = new Map(demoNotes.map((note) => [note.id, note]));

export const toTodoView = (todo: Todo): TodoView => {
	const anchor = todo.sourceAnchorId ? anchorsById.get(todo.sourceAnchorId) : undefined;
	const sourceNote = anchor ? notesById.get(anchor.noteId) : undefined;
	const provenance = todo.provenanceId ? provenancesById.get(todo.provenanceId) : undefined;
	return {
		todo,
		...(anchor !== undefined ? { anchor } : {}),
		...(sourceNote !== undefined ? { sourceNote: noteRef(sourceNote) } : {}),
		...(provenance !== undefined ? { provenance } : {})
	};
};
export const demoTodoViews: readonly TodoView[] = demoTodos.map(toTodoView);

const relationshipId = (n: number): RelationshipId => uuid(6, n) as RelationshipId;
const priorDecisionRelationship: NoteRelationship = {
	id: relationshipId(1),
	userId: demoIds.user,
	sourceNoteId: decisionNote.id,
	targetNoteId: marchDecisionNote.id,
	kind: 'prior_decision',
	justification: 'The March decision covered the same order-flow integration.',
	sourceAnchorId: decisionAnchor.id,
	provenanceId: relateProvenance.id,
	createdAt: dt('2026-07-10T11:05:00.000Z'),
	updatedAt: dt('2026-07-10T11:05:00.000Z')
};
const contradictsRelationship: NoteRelationship = {
	...priorDecisionRelationship,
	id: relationshipId(2),
	kind: 'contradicts',
	justification: 'Chooses asynchronous messaging where March decided synchronous REST.',
	createdAt: dt('2026-07-10T11:06:00.000Z'),
	updatedAt: dt('2026-07-10T11:06:00.000Z')
};
export const demoRelationships: readonly NoteRelationship[] = [
	priorDecisionRelationship,
	contradictsRelationship
];
export const toBacklinkView = (relationship: NoteRelationship): BacklinkView => ({
	relationship,
	sourceNote: noteRef(notesById.get(relationship.sourceNoteId) ?? demoNote),
	targetNote: noteRef(notesById.get(relationship.targetNoteId) ?? demoNote)
});
export const demoBacklinkViews: readonly BacklinkView[] = demoRelationships.map(toBacklinkView);

const referenceId = (n: number): ReferenceId => uuid(7, n) as ReferenceId;
const makeReference = (
	id: ReferenceId,
	noteId: NoteId,
	title: string,
	url: string,
	tier: ExternalReference['tier'],
	relevanceNote: string
): ExternalReference => ({
	id,
	userId: demoIds.user,
	noteId,
	url: url as Url,
	title,
	tier,
	relevanceNote,
	provenanceId: referenceProvenance.id,
	createdAt: demoNow
});
export const demoReferences: readonly ExternalReference[] = [
	makeReference(
		referenceId(1),
		decisionNote.id,
		'RFC 9110 — HTTP Semantics',
		'https://www.rfc-editor.org/rfc/rfc9110',
		'standard',
		'Baseline semantics for the REST endpoints being replaced.'
	),
	makeReference(
		referenceId(2),
		decisionNote.id,
		'Azure Service Bus documentation',
		'https://learn.microsoft.com/azure/service-bus-messaging/',
		'vendor',
		'Candidate broker for the asynchronous order flows.'
	),
	makeReference(
		referenceId(3),
		workshopNote.id,
		'Patterns for event-driven integration',
		'https://example.com/event-driven-patterns',
		'community',
		'Survey of retry and ordering trade-offs relevant to the workshop discussion.'
	)
];

const diagramId = (n: number): DiagramId => uuid(8, n) as DiagramId;
const orderFlowMermaid: Diagram = {
	id: diagramId(1),
	userId: demoIds.user,
	noteId: decisionNote.id,
	kind: 'mermaid',
	title: 'Order flow',
	source: 'flowchart LR\n  Client-->Gateway\n  Gateway-->Broker\n  Broker-->Warehouse',
	searchableText: 'Client Gateway Broker Warehouse',
	renderedSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>',
	sourceAnchorId: decisionAnchor.id,
	provenanceId: agentProvenance.id,
	createdAt: demoNow,
	updatedAt: demoNow
};
const orderFlowDrawio: Diagram = {
	...orderFlowMermaid,
	id: diagramId(2),
	kind: 'drawio',
	title: 'Order flow (deliverable)',
	source: '<mxfile />',
	promotedFromId: orderFlowMermaid.id
};
export const demoDiagrams: readonly Diagram[] = [orderFlowMermaid, orderFlowDrawio];

const suggestionId = (n: number): SuggestionId => uuid(9, n) as SuggestionId;
const backlinkSuggestion: Suggestion = {
	id: suggestionId(1),
	userId: demoIds.user,
	noteId: decisionNote.id,
	kind: 'backlink',
	status: 'proposed',
	payload: {
		sourceNoteId: decisionNote.id,
		targetNoteId: marchDecisionNote.id,
		kind: 'contradicts',
		justification: 'Chooses asynchronous messaging where March decided synchronous REST.',
		sourceAnchorId: decisionAnchor.id,
		provenanceId: relateProvenance.id
	},
	confidence: 0.86 as Confidence,
	provenanceId: relateProvenance.id,
	sourceAnchorId: decisionAnchor.id,
	isAutoAccepted: false,
	createdAt: dt('2026-07-10T11:06:00.000Z'),
	updatedAt: dt('2026-07-10T11:06:00.000Z')
};
const referenceSuggestion: Suggestion = {
	...backlinkSuggestion,
	id: suggestionId(2),
	kind: 'reference',
	payload: {
		noteId: decisionNote.id,
		url: 'https://www.rfc-editor.org/rfc/rfc9110' as Url,
		title: 'RFC 9110 — HTTP Semantics',
		tier: 'standard',
		relevanceNote: 'Grounds the comparison between REST and messaging semantics.',
		sourceAnchorId: decisionAnchor.id,
		provenanceId: referenceProvenance.id
	},
	confidence: 0.74 as Confidence,
	provenanceId: referenceProvenance.id
};
const impliedTodoSuggestion: Suggestion = {
	id: suggestionId(3),
	userId: demoIds.user,
	noteId: workshopNote.id,
	kind: 'todo',
	status: 'proposed',
	payload: {
		title: 'Schedule follow-up security workshop',
		responsibility: 'mine',
		promiseStrength: 'implied',
		sourceAnchorId: specAnchor.id,
		provenanceId: extractProvenance.id
	},
	confidence: 0.61 as Confidence,
	provenanceId: extractProvenance.id,
	sourceAnchorId: specAnchor.id,
	isAutoAccepted: false,
	createdAt: dt('2026-07-09T17:00:00.000Z'),
	updatedAt: dt('2026-07-09T17:00:00.000Z')
};
const diagramSuggestion: Suggestion = {
	...impliedTodoSuggestion,
	id: suggestionId(4),
	noteId: decisionNote.id,
	kind: 'diagram',
	payload: {
		noteId: decisionNote.id,
		kind: 'mermaid',
		title: 'Error path',
		source: 'flowchart LR\n  Broker-->DLQ'
	},
	provenanceId: agentProvenance.id,
	createdAt: dt('2026-07-10T12:00:00.000Z'),
	updatedAt: dt('2026-07-10T12:00:00.000Z')
};
export const demoSuggestions: readonly Suggestion[] = [
	demoSuggestion,
	backlinkSuggestion,
	referenceSuggestion,
	impliedTodoSuggestion,
	diagramSuggestion
];
export const toSuggestionView = (suggestion: Suggestion): SuggestionView => {
	const note = suggestion.noteId ? notesById.get(suggestion.noteId) : undefined;
	const anchor = suggestion.sourceAnchorId ? anchorsById.get(suggestion.sourceAnchorId) : undefined;
	return {
		suggestion,
		provenance:
			provenancesById.get(suggestion.provenanceId) ??
			({ ...extractProvenance, id: suggestion.provenanceId } satisfies Provenance),
		...(note !== undefined ? { note: noteRef(note) } : {}),
		...(anchor !== undefined ? { anchor } : {})
	};
};
export const demoSuggestionViews: readonly SuggestionView[] = demoSuggestions.map(toSuggestionView);
export const demoSuggestionGroups: readonly SuggestionGroup[] = (() => {
	const byNote = new Map<string, SuggestionView[]>();
	for (const view of demoSuggestionViews) {
		const key = view.note?.id ?? '';
		byNote.set(key, [...(byNote.get(key) ?? []), view]);
	}
	return [...byNote.values()].map((views) =>
		views[0]?.note ? { note: views[0].note, suggestions: views } : { suggestions: views }
	);
})();

export const demoTrustPolicies: readonly TrustPolicy[] = (
	['extract_promises', 'relate', 'reference', 'agent'] as const
).map((pipeline) => ({
	userId: demoIds.user,
	pipeline,
	autoAcceptEnabled: pipeline === 'extract_promises',
	conditions: {},
	createdAt: demoNow,
	updatedAt: demoNow,
	...(pipeline === 'extract_promises' ? { minimumConfidence: 0.9 as Confidence } : {})
}));

const adrSkill: Skill = {
	note: adrSkillNote,
	name: 'ADR format',
	description: 'How I structure architecture decision records.',
	triggerHints: ['adr', 'decision record'],
	isEnabled: true
};
export const demoSkillSummaries: readonly SkillSummary[] = [
	{
		noteId: adrSkillNote.id,
		name: adrSkill.name,
		description: adrSkill.description,
		triggerHints: adrSkill.triggerHints,
		isEnabled: adrSkill.isEnabled
	}
];
export const demoSkillView: SkillView = {
	skill: adrSkill,
	usages: [
		{
			usage: {
				id: uuid(10, 1) as SkillUsageId,
				skillNoteId: adrSkillNote.id,
				contextNoteId: decisionNote.id,
				provenanceId: agentProvenance.id,
				createdAt: dt('2026-07-10T11:30:00.000Z')
			},
			contextNote: noteRef(decisionNote)
		},
		{
			usage: {
				id: uuid(10, 2) as SkillUsageId,
				skillNoteId: adrSkillNote.id,
				contextNoteId: marchDecisionNote.id,
				createdAt: dt('2026-03-12T10:30:00.000Z')
			},
			contextNote: noteRef(marchDecisionNote)
		}
	]
};

export const demoShellContext: ShellContext = {
	user: demoUser,
	noteTree: demoNoteSummaries,
	pendingSuggestionCount: demoSuggestions.length
};

export const demoTodayView: TodayView = {
	overdue: [toTodoView(overdueTodo)],
	dueToday: [toTodoView(dueTodayTodo)],
	waitingOn: [toTodoView(waitingTodo)],
	pendingSuggestionCount: demoSuggestions.length,
	pinnedNotes: demoNoteSummaries.filter((note) => note.isPinned),
	recentNotes: [...demoNoteSummaries]
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
		.slice(0, 8)
};

const noteView = (note: Note): NoteView => ({
	note,
	backlinks: demoBacklinkViews.filter(
		(view) => view.sourceNote.id === note.id || view.targetNote.id === note.id
	),
	references: demoReferences.filter((reference) => reference.noteId === note.id),
	diagrams: demoDiagrams.filter((diagram) => diagram.noteId === note.id),
	todos: demoTodoViews.filter((view) => view.anchor?.noteId === note.id),
	pendingSuggestions: demoSuggestionViews.filter(
		(view) => view.suggestion.noteId === note.id && view.suggestion.status === 'proposed'
	)
});
export const demoNoteViews: ReadonlyMap<NoteId, NoteView> = new Map(
	demoNotes.map((note) => [note.id, noteView(note)])
);
