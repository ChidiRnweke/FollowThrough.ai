import type { ChatToolActivity } from '$lib/stores/chat-tools';

const labels: Readonly<Record<string, string>> = {
	save_note: 'Save note',
	publish_note: 'Publish note',
	discard_note_draft: 'Discard note draft',
	create_note: 'Create note',
	rename_note: 'Rename note',
	archive_note: 'Archive note',
	create_project: 'Create project',
	rename_project: 'Rename project',
	archive_project: 'Archive project',
	create_todo: 'Create todo',
	update_todo: 'Update todo',
	get_note: 'Read note'
};

const completedLabels: Readonly<Record<string, string>> = {
	create_note: 'Created note',
	rename_note: 'Renamed note',
	archive_note: 'Archived note',
	create_project: 'Created project',
	rename_project: 'Renamed project',
	archive_project: 'Archived project',
	create_todo: 'Created todo',
	update_todo: 'Updated todo',
	get_note: 'Read note'
};

export const friendlyToolLabel = (name: string): string =>
	labels[name] ??
	name
		.split('_')
		.map((part, index) => (index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
		.join(' ');

export function toolStatusLabel(tool: ChatToolActivity): string {
	if (tool.status === 'running') return `${friendlyToolLabel(tool.name)}…`;
	if (tool.status === 'rejected')
		return tool.name === 'save_note'
			? 'Note change rejected'
			: `${friendlyToolLabel(tool.name)} rejected`;
	if (tool.status === 'failed')
		return tool.name === 'save_note'
			? 'Note was not saved'
			: `${friendlyToolLabel(tool.name)} failed`;
	if (tool.status === 'succeeded') {
		if (tool.name === 'save_note') return 'Saved note';
		if (tool.name === 'publish_note') return 'Published note';
		if (tool.name === 'discard_note_draft') return 'Discarded note draft';
		return completedLabels[tool.name] ?? `${friendlyToolLabel(tool.name)} completed`;
	}
	return friendlyToolLabel(tool.name);
}

export function scalarSummaries(arguments_: Readonly<Record<string, unknown>>): string[] {
	return Object.entries(arguments_)
		.filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
		.slice(0, 4)
		.map(([key, value]) => `${friendlyToolLabel(key)}: ${String(value)}`);
}
