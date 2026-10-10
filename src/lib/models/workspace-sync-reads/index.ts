import { z } from 'zod';
import { syncCursorSchema, type SyncCursor } from '$lib/models/sync';
import {
	workspaceResourceIdentitySchema,
	type WorkspaceResourceIdentity
} from '$lib/models/workspace-sync';

export interface WorkspaceJournalChange {
	readonly kind: 'upsert' | 'delete';
	readonly identity: WorkspaceResourceIdentity;
	readonly version: bigint;
}

export interface WorkspaceJournalSelection {
	readonly head: SyncCursor;
	readonly checkpoint: SyncCursor;
	readonly hasMore: boolean;
	readonly changes: readonly WorkspaceJournalChange[];
}

export interface WorkspaceJournalPage {
	readonly cursor: SyncCursor;
	readonly hasMore: boolean;
	readonly changes: readonly WorkspaceJournalChange[];
}

/** Stored journal facts are validated before they reach a service. */
export const workspaceJournalBatchSchema = z.object({
	head: syncCursorSchema,
	checkpoint: syncCursorSchema,
	more: z.boolean(),
	changes: z.array(
		workspaceResourceIdentitySchema.and(
			z.object({
				operation: z.enum(['upsert', 'delete']),
				version: z.string().regex(/^[1-9][0-9]*$/)
			})
		)
	)
});
