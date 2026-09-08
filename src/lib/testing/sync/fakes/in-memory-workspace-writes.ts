import { syncEtag } from '$lib/models/sync';
import type { ActorContext } from '$lib/models/identity';
import type { WorkspaceWriteReceipt } from '$lib/models/workspace-records';
import type { WorkspaceResourceIdentity } from '$lib/models/workspace-sync';
import type { SyncObjectReader, SyncReceiptWriter } from '$lib/server/services/workspace/contracts';
import type { ReceiptLookup } from '$lib/server/repositories/workspace/sync-receipts';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';

export class InMemoryWorkspaceReceipts implements SyncReceiptWriter {
	private receipts = new Map<string, { request: string; receipt: WorkspaceWriteReceipt }>();
	writeFailure: string | null = null;
	async lock(): Promise<void> {}
	async find(actor: ActorContext, operationId: string, request: string): Promise<ReceiptLookup> {
		const stored = this.receipts.get(JSON.stringify([actor.userId, operationId]));
		return !stored
			? { kind: 'missing' }
			: stored.request !== request
				? { kind: 'reused' }
				: { kind: 'receipt', receipt: stored.receipt };
	}
	async save(actor: ActorContext, request: string, receipt: WorkspaceWriteReceipt): Promise<void> {
		if (this.writeFailure) throw new Error(this.writeFailure);
		this.receipts.set(JSON.stringify([actor.userId, receipt.operationId]), { request, receipt });
	}
	snapshot() {
		const receipts = new Map(this.receipts);
		return () => {
			this.receipts = receipts;
		};
	}
}

/** Note revision changes in this fake supply monotonically increasing test versions. */
export class InMemoryWorkspaceNoteReads implements SyncObjectReader {
	constructor(private readonly content: InMemoryNoteContent) {}
	async read(actor: ActorContext, identity: WorkspaceResourceIdentity) {
		const note = this.content.notes.find(
			(note) =>
				note.userId === actor.userId && identity.type === 'notes' && note.id === identity.id[0]
		);
		return note
			? {
					kind: 'found' as const,
					snapshot: {
						etag: syncEtag(BigInt(note.currentRevision)),
						value: { type: 'notes' as const, value: note }
					}
				}
			: { kind: 'unavailable' as const };
	}
}
