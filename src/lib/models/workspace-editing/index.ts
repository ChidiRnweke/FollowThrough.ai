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
