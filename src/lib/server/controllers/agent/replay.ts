import type { ActorContext } from '$lib/models/identity';
import type { ConversationId, PersistedSessionItem, SessionJson } from '$lib/models/agent';
import type { ReplayVirtualization } from '$lib/server/services/agent/conversations/replay-virtualizer';
export interface ReplayJsonReader {
	value(text: string): SessionJson;
}
export interface ReplayVirtualizer {
	virtualize(
		actor: ActorContext,
		conversationId: ConversationId,
		item: PersistedSessionItem
	): Promise<PersistedSessionItem>;
}
/** Resolve serialized call arguments at the boundary before applying file-virtualization rules. */
export class ConversationReplay implements ReplayVirtualizer {
	constructor(
		private readonly rules: ReplayVirtualization,
		private readonly reader: ReplayJsonReader
	) {}
	async virtualize(
		actor: ActorContext,
		conversationId: ConversationId,
		item: PersistedSessionItem
	): Promise<PersistedSessionItem> {
		const prepared = this.rules.prepare(item);
		if (prepared.kind === 'unchanged') return prepared.item;
		return this.rules.apply(
			actor,
			conversationId,
			prepared.kind === 'arguments'
				? { ...prepared, value: this.reader.value(prepared.item.arguments) }
				: prepared
		);
	}
}
