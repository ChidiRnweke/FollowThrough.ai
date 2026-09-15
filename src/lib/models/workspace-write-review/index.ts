import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { OutboxEntry } from '$lib/models/outbox';

type Entry = OutboxEntry<WorkspaceCommand, WorkspaceRecord>;
export const writeAction: Record<WorkspaceCommand['kind'], string> = {
	renameConversation: 'Renamed chat',
	setToolPreference: 'Changed tool preference',
	setProjectToolOverride: 'Changed project tool preference',
	resetProjectToolOverride: 'Reset project tool preference',
	updateTrustPolicy: 'Changed approval policy',
	updateUserPreferences: 'Changed preferences',
	updateAgentPreferences: 'Changed agent preferences',
	updateExportSettings: 'Changed export settings',
	createMemory: 'Created memory',
	updateMemory: 'Edited memory',
	deleteMemory: 'Deleted memory',
	createProject: 'Created project',
	renameProject: 'Renamed project',
	archiveProject: 'Archived project',
	projectNumbering: 'Changed project numbering',
	createFolder: 'Created folder',
	createNote: 'Created note',
	updateSkill: 'Edited skill',
	renameNote: 'Renamed note',
	saveNote: 'Edited note',
	archiveNote: 'Archived note',
	restoreNote: 'Restored note',
	publishNote: 'Published note',
	discardNoteDraft: 'Discarded note draft',
	noteNumbering: 'Changed note numbering',
	createTodo: 'Created task',
	updateTodo: 'Edited task',
	deleteTodo: 'Deleted task',
	saveDiagram: 'Edited diagram',
	renameDiagram: 'Renamed diagram',
	publishDiagram: 'Published diagram',
	archiveDiagram: 'Archived diagram',
	restoreDiagram: 'Restored diagram',
	deleteDiagram: 'Deleted diagram'
};
export const writeTitle = (entry: Entry): string => {
	const record = entry.intent.local ?? entry.intent.base?.value;
	if (!record) return 'Deleted item';
	if ('title' in record.value && record.value.title) return record.value.title;
	if ('name' in record.value) return record.value.name;
	return writeAction[entry.intent.command.kind];
};
export const writeGroup = (entry: Entry): 'decision' | 'waiting' | 'sending' =>
	entry.delivery.kind === 'queued'
		? 'waiting'
		: entry.delivery.kind === 'sending'
			? 'sending'
			: 'decision';
export const writeStatus = (entry: Entry): string => {
	const action = writeAction[entry.intent.command.kind];
	switch (entry.delivery.kind) {
		case 'queued':
			return `${action} · waiting to sync`;
		case 'sending':
			return `${action} · syncing…`;
		case 'retry':
			return `${action} · couldn't sync`;
		case 'rejected':
			return `${action} · needs a decision`;
		case 'conflict':
			return `${action} · ${entry.delivery.remote.kind === 'deleted' ? 'deleted elsewhere' : entry.delivery.remote.kind === 'unavailable' ? 'latest unavailable' : entry.intent.base === null ? 'already exists elsewhere' : 'also changed elsewhere'}`;
	}
};
export const writeExplanation = (entry: Entry, online: boolean): string => {
	switch (entry.delivery.kind) {
		case 'queued':
			return online
				? 'Saved on this device. This change is waiting to sync.'
				: "Saved on this device. It syncs when you're back online.";
		case 'sending':
			return 'Syncing…';
		case 'retry':
			return `Couldn't sync: ${entry.delivery.message}. Try again, or discard once you're back online.`;
		case 'rejected':
			return entry.delivery.message;
		case 'conflict':
			if (entry.delivery.remote.kind === 'deleted')
				return 'Deleted elsewhere. Download yours to keep a copy.';
			if (entry.delivery.remote.kind === 'unavailable')
				return "The latest version can't be loaded. Reconnect to compare.";
			return entry.intent.base === null
				? 'An item already exists here. Download yours and create another item to keep both.'
				: 'Also changed elsewhere. Pick the version to keep.';
	}
};

/** Only product fields are rendered; identities, storage roles and bookkeeping stay out of review. */
export const reviewFieldLabels: Readonly<Record<string, string>> = {
	name: 'Name',
	title: 'Title',
	description: 'Description',
	content: 'Content',
	status: 'Status',
	priority: 'Priority',
	dueDate: 'Due date',
	responsibility: 'Responsibility',
	completed: 'Completed',
	isPinned: 'Pinned',
	isEnabled: 'Enabled',
	shareWithAgents: 'Share with agents',
	enabled: 'Enabled',
	language: 'Language',
	theme: 'Theme',
	numberingEnabled: 'Numbering',
	defaultModel: 'Default model',
	systemPrompt: 'Instructions',
	instructions: 'Instructions',
	fontFamily: 'Font',
	fontSize: 'Font size',
	pageSize: 'Page size',
	orientation: 'Orientation',
	preferences: 'Preferences',
	policy: 'Approval policy',
	mode: 'Mode',
	sectionNumbering: 'Section numbering',
	sectionNumberingDefault: 'Default section numbering',
	defaultVisionModel: 'Vision model',
	inlineModel: 'Suggestion model',
	attachmentVisionModel: 'Attachment vision model',
	webSearchEngine: 'Search engine',
	webSearchMaxResults: 'Results per search',
	webSearchMaxTotalResults: 'Total search results',
	agentMaxTurns: 'Agent turn limit',
	executionMode: 'Execution mode',
	inlineSuggestionsEnabled: 'Inline suggestions',
	toolName: 'Tool',
	pipeline: 'Workflow',
	autoAcceptEnabled: 'Automatic acceptance',
	minimumConfidence: 'Minimum confidence',
	settings: 'Export settings',
	archivedAt: 'Archived',
	slug: 'Address',
	dueAt: 'Due date',
	completedAt: 'Completed'
};

export const visibleReviewFields = (record: WorkspaceRecord, title: string) =>
	Object.entries(record.value).filter(
		([field, value]) =>
			reviewFieldLabels[field] &&
			value !== undefined &&
			value !== null &&
			!((field === 'name' || field === 'title') && value === title)
	);
export const hasReviewContent = (record: WorkspaceRecord | null, title: string): boolean =>
	record === null ||
	record.type === 'notes' ||
	record.type === 'diagrams' ||
	visibleReviewFields(record, title).length > 0;
