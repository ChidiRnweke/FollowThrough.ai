import type { WriteBase } from '$lib/models/outbox';
import type { WorkspaceRecord, WorkspaceValues } from '$lib/models/workspace-records';
import type { WorkspaceResourceType } from '$lib/models/workspace-sync';
export interface WorkspaceEditContext {
	readonly base: WriteBase<WorkspaceRecord> | null;
	readonly basedOn: string | null;
	readonly local: WorkspaceRecord;
}
export interface StagedWrite {
	readonly base: WriteBase<WorkspaceRecord> | null;
	readonly basedOn: string;
	readonly local: WorkspaceRecord | null;
}
export type WorkspaceSave<K extends WorkspaceResourceType> =
	| { readonly kind: 'saved'; readonly value: WorkspaceValues[K] | null }
	| { readonly kind: 'failure'; readonly message: string };

/** The outcome of one complete local edit: stored durably on this device, or refused. */
export type WorkspaceChange<T> =
	| { readonly kind: 'saved'; readonly value: T }
	| { readonly kind: 'failure'; readonly message: string };

/**
 * How far a list of edits got: they are stored in order, so the first `saved` are on this
 * device and a failure stops the rest.
 */
export type WorkspaceBatch =
	| { readonly kind: 'complete'; readonly saved: number }
	| { readonly kind: 'failure'; readonly saved: number; readonly message: string };
