import type { ActorContext, UserId } from '$lib/models/identity';
import { syncChangePageSize, type SyncCursor } from '$lib/models/sync';
import type {
	WorkspaceJournalChange,
	WorkspaceJournalSelection
} from '$lib/models/workspace-sync-reads';
import type { SyncChangesRepository } from '$lib/server/repositories/workspace/sync-changes';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';

/** Compact journal storage, with account-local cursors and latest resource versions. */
export class InMemoryWorkspaceJournal implements SyncChangesRepository {
	private readonly accounts = new Map<
		UserId,
		{
			head: bigint;
			changes: Map<string, { cursor: bigint; change: WorkspaceJournalChange }>;
		}
	>();
	private readonly keys = new WorkspaceCommandRulesService();

	createAccount(actor: ActorContext, head = 0n) {
		this.accounts.set(actor.userId, { head, changes: new Map() });
	}

	publish(actor: ActorContext, change: WorkspaceJournalChange) {
		const account = this.account(actor);
		account.changes.set(this.keys.workspaceResourceKey(change.identity), {
			cursor: ++account.head,
			change
		});
	}

	async readSelection(actor: ActorContext, since: SyncCursor): Promise<WorkspaceJournalSelection> {
		const account = this.account(actor);
		const remaining = [...account.changes.values()]
			.filter(({ cursor }) => cursor > BigInt(since))
			.sort((a, b) => (a.cursor < b.cursor ? -1 : 1));
		const selected = remaining.slice(0, syncChangePageSize);
		return {
			head: String(account.head) as SyncCursor,
			checkpoint: String(selected.at(-1)?.cursor ?? account.head) as SyncCursor,
			hasMore: remaining.length > selected.length,
			changes: selected.map(({ change }) => change)
		};
	}

	private account(actor: ActorContext) {
		const account = this.accounts.get(actor.userId);
		if (!account) throw new Error('The account has no synchronization head');
		return account;
	}
}
