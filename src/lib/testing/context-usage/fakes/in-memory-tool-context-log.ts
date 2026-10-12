import type { ToolContextLog } from '$lib/models/context-usage';
import type { ToolContextLogRepository } from '$lib/server/repositories/context-usage';

/** The actor's journalled context reads; a fresh log has no chats and no reads. */
export class InMemoryToolContextLog implements ToolContextLogRepository {
	log: ToolContextLog = { touches: [], emptySearches: [], conversations: [], unreadableCalls: 0 };

	async read(): Promise<ToolContextLog> {
		return this.log;
	}
}
