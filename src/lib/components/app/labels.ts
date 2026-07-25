import type {
	DateTime,
	LocalDate,
	MemoryEntryType,
	PipelineKind,
	Provenance,
	ReferenceTier,
	RelationshipKind,
	SuggestionKind,
	TodoPriority,
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
	agent: 'Agent',
	memory: 'Memory'
};

export const suggestionKindLabels: Record<SuggestionKind, string> = {
	todo: 'Todo',
	backlink: 'Backlink',
	reference: 'Reference',
	diagram: 'Diagram',
	memory: 'Memory'
};

export const todoStatusLabels: Record<TodoStatus, string> = {
	backlog: 'Backlog',
	open: 'Open',
	in_progress: 'In progress',
	done: 'Done',
	cancelled: 'Cancelled'
};

/** One dry voice line per empty kanban column — see DESIGN_SYSTEM.md "Voice & tone". */
export const todoStatusEmptyCopy: Record<TodoStatus, string> = {
	backlog: 'Nothing waiting in the wings.',
	open: 'Nothing open. Pull something in.',
	in_progress: 'Nothing in flight.',
	done: 'Nothing finished yet.',
	cancelled: 'Nothing called off.'
};

/** Semantic presentation for a status value: a dot, a badge wash, and an accent bar. */
export interface StatusStyle {
	/** Background utility for a small status dot, e.g. `bg-success`. */
	readonly dotClass: string;
	/** Text + optional wash utilities for a badge/label. */
	readonly badgeClass: string;
	/** Background utility for a 2px accent bar (kanban column header). */
	readonly accentClass: string;
}

export const todoStatusStyle: Record<TodoStatus, StatusStyle> = {
	backlog: {
		dotClass: 'bg-muted-foreground/40',
		badgeClass: 'text-muted-foreground',
		accentClass: 'bg-border'
	},
	open: {
		dotClass: 'bg-primary',
		badgeClass: 'bg-primary/10 text-primary',
		accentClass: 'bg-primary'
	},
	in_progress: {
		dotClass: 'bg-warning',
		badgeClass: 'bg-warning/15 text-warning',
		accentClass: 'bg-warning'
	},
	done: {
		dotClass: 'bg-success',
		badgeClass: 'bg-success/15 text-success',
		accentClass: 'bg-success'
	},
	cancelled: {
		dotClass: 'bg-muted-foreground/40',
		badgeClass: 'text-muted-foreground',
		accentClass: 'bg-border'
	}
};

export const todoPriorityLabels: Record<TodoPriority, string> = {
	low: 'Low',
	medium: 'Medium',
	high: 'High'
};

/** Priority is urgency, so it borrows the urgency ramp: quiet → warning → destructive. */
export const todoPriorityStyle: Record<TodoPriority, StatusStyle> = {
	low: {
		dotClass: 'bg-muted-foreground/40',
		badgeClass: 'text-muted-foreground',
		accentClass: 'bg-border'
	},
	medium: {
		dotClass: 'bg-warning',
		badgeClass: 'bg-warning/15 text-warning',
		accentClass: 'bg-warning'
	},
	high: {
		dotClass: 'bg-destructive',
		badgeClass: 'bg-destructive/10 text-destructive',
		accentClass: 'bg-destructive'
	}
};

export const memoryEntryTypeLabels: Record<MemoryEntryType, string> = {
	fact: 'Fact',
	decision: 'Decision',
	constraint: 'Constraint',
	preference: 'Preference'
};

/** Attachment ingestion state → semantic style. `ready` reads as confirmed. */
export function attachmentStatusStyle(
	status: 'queued' | 'processing' | 'ready' | 'partial' | 'unsupported' | 'failed'
): StatusStyle {
	switch (status) {
		case 'ready':
			return {
				dotClass: 'bg-success',
				badgeClass: 'bg-success/15 text-success',
				accentClass: 'bg-success'
			};
		case 'queued':
		case 'processing':
		case 'partial':
			return {
				dotClass: 'bg-warning',
				badgeClass: 'bg-warning/15 text-warning',
				accentClass: 'bg-warning'
			};
		case 'failed':
		case 'unsupported':
			return {
				dotClass: 'bg-destructive',
				badgeClass: 'bg-destructive/10 text-destructive',
				accentClass: 'bg-destructive'
			};
	}
}

const byteUnits = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** Human-readable file size, e.g. `113409` → `111 KB`. */
export function formatBytes(bytes: number): string {
	if (bytes < 1) return '0 B';
	const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), byteUnits.length - 1);
	const value = bytes / 1024 ** exponent;
	const rounded = exponent === 0 ? value : Math.round(value * 10) / 10;
	return `${rounded} ${byteUnits[exponent]}`;
}

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

// `now` lets a server-rendered relative time be formatted against the instant the
// loader captured. Reading the clock here during both the SSR pass and hydration
// yields two different strings and a hydration mismatch.
export function formatRelativeTime(dateTime: DateTime, now: number = Date.now()): string {
	const seconds = Math.round((new Date(dateTime).getTime() - now) / 1000);
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
