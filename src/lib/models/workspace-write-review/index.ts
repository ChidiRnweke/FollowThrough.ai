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
	createSkill: 'Created skill',
	updateSkill: 'Edited skill',
	renameNote: 'Renamed note',
	saveNote: 'Edited note',
	archiveNote: 'Archived note',
	restoreNote: 'Restored note',
	publishNote: 'Published note',
	discardNoteDraft: 'Discarded note draft',
	deleteNote: 'Deleted note',
	noteNumbering: 'Changed note numbering',
	moveNote: 'Moved note',
	createTodo: 'Created task',
	updateTodo: 'Edited task',
	deleteTodo: 'Deleted task',
	saveDiagram: 'Edited diagram',
	renameDiagram: 'Renamed diagram',
	publishDiagram: 'Published diagram',
	restoreDiagramRevision: 'Restored diagram version',
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
export const writeExplanation = (entry: Entry, online: boolean): string => {
	switch (entry.delivery.kind) {
		case 'queued':
			return online
				? 'This change is saved on this device and is waiting to send.'
				: 'This change is saved on this device. It will send when you reconnect.';
		case 'sending':
			return 'This change is being sent. Wait for confirmation before deciding what to keep.';
		case 'retry':
			return `${entry.delivery.message} The last send is not confirmed. Retry, or reconnect to cancel it safely.`;
		case 'rejected':
			return entry.delivery.message;
		case 'conflict':
			return entry.intent.base === null
				? 'An item already exists here. Download your change and create another item to keep both.'
				: entry.delivery.remote.kind === 'found'
					? 'The saved version changed. Compare the versions, then keep your change or discard it.'
					: entry.delivery.remote.kind === 'deleted'
						? 'This item was deleted on the server. Download your change before discarding it; recreation needs a new item.'
						: 'The current server version is unavailable. Reconnect and retry before choosing a version.';
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
