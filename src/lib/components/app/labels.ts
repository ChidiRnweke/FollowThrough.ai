import type {
	DateTime,
	LocalDate,
	PipelineKind,
	Provenance,
	ReferenceTier,
	RelationshipKind,
	SuggestionKind,
	TodoStatus
} from '$lib/models';

export const relationshipLabels: Record<RelationshipKind, string> = {
	prior_decision: 'Prior decision',
	contradicts: 'Contradicts',
	elaborates: 'Elaborates',
	mentions: 'Mentions'
};

export const referenceTierLabels: Record<ReferenceTier, string> = {
	official: 'Official docs',
	standard: 'Standard',
	vendor: 'Vendor',
	community: 'Blog'
};

export const pipelineLabels: Record<PipelineKind, string> = {
	extract_promises: 'Extract Promises',
	relate: 'Relate',
	reference: 'Reference',
	agent: 'Agent'
};

export const suggestionKindLabels: Record<SuggestionKind, string> = {
	todo: 'Todo',
	backlink: 'Backlink',
	reference: 'Reference',
	diagram: 'Diagram'
};

export const todoStatusLabels: Record<TodoStatus, string> = {
	backlog: 'Backlog',
	open: 'Open',
	in_progress: 'In progress',
	done: 'Done',
	cancelled: 'Cancelled'
};

const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
	day: 'numeric',
	month: 'short',
	year: 'numeric'
});

export function formatDate(date: LocalDate): string {
	return dateFormatter.format(new Date(date));
}

export function formatDateTime(dateTime: DateTime): string {
	return dateTimeFormatter.format(new Date(dateTime));
}

const relativeFormatter = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' });

export function formatRelativeTime(dateTime: DateTime): string {
	const seconds = Math.round((new Date(dateTime).getTime() - Date.now()) / 1000);
	const minutes = Math.round(seconds / 60);
	const hours = Math.round(minutes / 60);
	const days = Math.round(hours / 24);
	if (Math.abs(seconds) < 60) return 'just now';
	if (Math.abs(minutes) < 60) return relativeFormatter.format(minutes, 'minute');
	if (Math.abs(hours) < 24) return relativeFormatter.format(hours, 'hour');
	if (Math.abs(days) < 7) return relativeFormatter.format(days, 'day');
	return formatDateTime(dateTime);
}

export function provenanceCaption(provenance: Provenance, sourceTitle?: string): string {
	const producer = provenance.pipeline
		? pipelineLabels[provenance.pipeline]
		: provenance.producerName;
	const parts = [producer, sourceTitle, formatDateTime(provenance.createdAt)];
	return parts.filter((part): part is string => part !== undefined).join(' · ');
}

export function todayLocalDate(): LocalDate {
	return new Date().toISOString().slice(0, 10) as LocalDate;
}
