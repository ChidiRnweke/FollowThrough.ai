import type { ActorContext } from '$lib/models/identity';
import type { SyncCursor } from '$lib/models/sync';
import type { WorkspaceJournalPage } from '$lib/models/workspace-sync-reads';
import type { SyncChangesRepository } from '$lib/server/repositories/workspace/sync-changes';

export interface WorkspaceJournalReader {
	selectPage(actor: ActorContext, since: SyncCursor): Promise<WorkspaceJournalPage>;
}

export class WorkspaceJournal implements WorkspaceJournalReader {
	constructor(private readonly repository: SyncChangesRepository) {}

	async selectPage(actor: ActorContext, since: SyncCursor): Promise<WorkspaceJournalPage> {
		const selection = await this.repository.readSelection(actor, since);
		if (BigInt(since) > BigInt(selection.head))
			throw new Error('The client cursor is ahead of this account');
		return {
			cursor: selection.hasMore ? selection.checkpoint : selection.head,
			hasMore: selection.hasMore,
			changes: selection.changes
		};
	}
}
