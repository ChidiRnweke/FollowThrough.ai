import type { WorkspaceRecord } from '$lib/models/workspace-records';
import {
	writeAction,
	reviewFieldLabels,
	type WorkspaceWriteReviewEntry as Entry
} from '$lib/models/workspace-write-review';

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
