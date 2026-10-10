import type { ActorContext } from '$lib/models/identity';
import type {
	ConversationId,
	PersistedSessionItem,
	SessionJsonObject,
	SessionJson
} from '$lib/models/agent';
import type { ConversationHistory } from '$lib/server/services/agent/conversations/history';
import type { ReplayVirtualization } from '$lib/server/services/agent/conversations/replay-virtualizer';
import type { ConversationSessionStore } from '$lib/server/stores/agent/conversation';
export interface ConversationJsonReader {
	value(text: string): SessionJson;
	failure(text: string): string | undefined;
	object(text: string): SessionJsonObject | undefined;
}
export interface ConversationSessionController {
	readonly id: ConversationId;
	getItems(limit?: number): Promise<readonly PersistedSessionItem[]>;
	addItems(items: readonly PersistedSessionItem[]): Promise<void>;
	popItem(): Promise<PersistedSessionItem | undefined>;
	clear(): void;
	snapshot(): Promise<readonly PersistedSessionItem[]>;
}
export class ConversationSessions implements ConversationSessionController {
	constructor(
		private readonly history: ConversationHistory,
		private readonly state: ConversationSessionStore,
		private readonly actor: ActorContext,
		readonly id: ConversationId,
		private readonly virtualizer: ReplayVirtualization,
		private readonly reader: ConversationJsonReader
	) {}
	async getItems(limit?: number): Promise<readonly PersistedSessionItem[]> {
		const items = await this.load();
		let shown = this.state.presented;
		if (!shown) {
			const failed = new Set<string>();
			for (const result of this.history.diagramResults(items)) {
				if (this.reader.failure(result.text) !== undefined) failed.add(result.callId);
			}
			const documents = new Map(
				this.history
					.replaySources(items, failed)
					.map((source) => [source.index, this.reader.object(source.json)])
			);
			shown = this.history.present(items, documents);
			this.state.present(shown);
		}
		return limit === undefined ? shown : shown.slice(-limit);
	}
	async addItems(items: readonly PersistedSessionItem[]): Promise<void> {
		this.state.replace([...(await this.load()), ...items]);
	}
	async popItem(): Promise<PersistedSessionItem | undefined> {
		const items = await this.load();
		const item = items.at(-1);
		this.state.replace(items.slice(0, -1));
		return item;
	}
	clear(): void {
		this.state.replace([]);
	}
	async snapshot(): Promise<readonly PersistedSessionItem[]> {
		return Promise.all(
			this.history.persistable(await this.load()).map((item) => this.virtualize(item))
		);
	}
	private async virtualize(item: PersistedSessionItem): Promise<PersistedSessionItem> {
		const prepared = this.virtualizer.prepare(item);
		if (prepared.kind === 'unchanged') return prepared.item;
		return this.virtualizer.apply(
			this.actor,
			this.id,
			prepared.kind === 'arguments'
				? { ...prepared, value: this.reader.value(prepared.item.arguments) }
				: prepared
		);
	}
	private async load(): Promise<readonly PersistedSessionItem[]> {
		const loaded = this.state.loaded;
		if (loaded) return loaded;
		const items = await this.history.load(this.actor, this.id);
		this.state.replace(items);
		return items;
	}
}
