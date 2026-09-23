import type { ActorContext } from '$lib/models/identity';
import type { ConversationId } from '$lib/models/agent';
import type { CanvasSessionResult, DiagramId } from '$lib/models/diagrams';

export interface CanvasSourceItems {
	listCanvasResults(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<readonly CanvasSessionResult[]>;
}

/** The latest successful diagram write in the conversation, backed by its full transcript. */
export class PresentedCanvasSource {
	constructor(private readonly items: CanvasSourceItems) {}

	async latest(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<DiagramId | undefined> {
		const results = await this.items.listCanvasResults(actor, conversationId);
		for (let index = results.length - 1; index >= 0; index -= 1) {
			const result = results[index]!;
			if (result.kind === 'written') return result.diagramId;
			// Corruption must not look like an empty or stale canvas. An older corrupt
			// result after a newer successful write is no longer authoritative.
			if (result.kind === 'corrupt') throw new Error(result.reason);
		}
		return undefined;
	}
}
