import type { DraftStatus, OutboxEntry, WriteReceipt } from '$lib/models/outbox';
import type { SyncEtag, SyncSnapshot } from '$lib/models/sync';
import type { WorkspaceEditContext } from '$lib/models/workspace-editing';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
type Entries = readonly OutboxEntry<WorkspaceCommand, WorkspaceRecord>[];
export interface IWorkspaceDraftService {
	editBase(
		entries: Entries,
		key: string,
		snapshot: SyncSnapshot<WorkspaceRecord> | null
	): WorkspaceEditContext;
	observedVersion(
		current: WorkspaceEditContext,
		receipt: WriteReceipt<WorkspaceRecord> | null
	): SyncEtag | null;
	uncertain(
		entries: Entries,
		receipt: WriteReceipt<WorkspaceRecord> | null,
		operationId: string | null
	): boolean;
	value(
		current: WorkspaceEditContext | null,
		entries: Entries,
		deleted: boolean
	): WorkspaceRecord | null;
	status(
		error: string | null,
		uncertain: boolean,
		captured: boolean,
		savingLocal: number,
		entries: Entries
	): DraftStatus;
	lastError(error: string | null, uncertain: boolean, entries: Entries): string | undefined;
}
/** Draft decisions use the captured version and durable evidence, never a second cache. */
export class WorkspaceDraftService implements IWorkspaceDraftService {
	editBase(
		entries: Entries,
		key: string,
		snapshot: SyncSnapshot<WorkspaceRecord> | null
	): WorkspaceEditContext {
		const pending = entries.findLast((entry) => entry.intent.key === key);
		if (pending) {
			if (!pending.intent.local) throw new Error('A locally deleted resource cannot be edited');
			return {
				base: pending.intent.base,
				basedOn: pending.intent.operationId,
				local: pending.intent.local
			};
		}
		if (!snapshot) throw new Error('Open the resource before editing it');
		return { base: snapshot, basedOn: null, local: snapshot.value };
	}
	observedVersion(
		current: WorkspaceEditContext,
		receipt: WriteReceipt<WorkspaceRecord> | null
	): SyncEtag | null {
		if (current.basedOn === null) return current.base?.etag ?? null;
		if (receipt?.operationId !== current.basedOn) return null;
		return receipt.resource.kind === 'found'
			? receipt.resource.snapshot.etag
			: receipt.resource.etag;
	}
	uncertain(
		entries: Entries,
		receipt: WriteReceipt<WorkspaceRecord> | null,
		operationId: string | null
	): boolean {
		return (
			operationId !== null &&
			!entries.some((entry) => entry.intent.operationId === operationId) &&
			receipt?.operationId !== operationId
		);
	}
	value(
		current: WorkspaceEditContext | null,
		entries: Entries,
		deleted: boolean
	): WorkspaceRecord | null {
		const creation = current?.base === null && current.basedOn === null;
		if (!creation && !entries.length && deleted) return null;
		const last = entries.at(-1);
		return last ? last.intent.local : (current?.local ?? null);
	}
	status(
		error: string | null,
		uncertain: boolean,
		captured: boolean,
		savingLocal: number,
		entries: Entries
	): DraftStatus {
		if (error || uncertain) return 'error';
		if (!captured) return 'loading';
		if (savingLocal) return 'saving';
		if (entries.some((entry) => entry.delivery.kind === 'conflict')) return 'conflict';
		if (
			entries.some((entry) => entry.delivery.kind === 'rejected' || entry.delivery.kind === 'retry')
		)
			return 'error';
		if (entries.some((entry) => entry.delivery.kind === 'sending')) return 'saving';
		return entries.length ? 'pending' : 'synced';
	}
	lastError(error: string | null, uncertain: boolean, entries: Entries): string | undefined {
		if (uncertain) return 'This item changed elsewhere. Save your edits to review the versions.';
		if (error) return error;
		const failed = entries.find(
			(entry) => entry.delivery.kind === 'rejected' || entry.delivery.kind === 'retry'
		);
		return failed && (failed.delivery.kind === 'rejected' || failed.delivery.kind === 'retry')
			? failed.delivery.message
			: undefined;
	}
}
