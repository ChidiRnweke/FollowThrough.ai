import { z } from 'zod';
import type { ActorContext } from '$lib/models/identity';
import type { ConversationId, PersistedSessionItem } from '$lib/models/agent';
import { sessionOutputText } from '$lib/models/agent';
import type { DiagramId } from '$lib/models/diagrams';

/**
 * The diagram currently on a conversation's canvas, found in its transcript.
 *
 * The transcript is what makes this survive a reload: tool calls are replayed, so
 * the last diagram a conversation wrote is still the last one after a reconnect.
 * It answers with an id rather than a document — the row holds the source, and
 * reading it from there means the agent gets what is stored rather than what was
 * sent.
 */
export interface CanvasSourceItems {
	list(
		actor: ActorContext,
		conversationId: ConversationId,
		limit?: number
	): Promise<readonly { readonly item: PersistedSessionItem }[]>;
}

const WRITING_TOOLS: ReadonlySet<string> = new Set(['create_diagram', 'edit_diagram']);

/**
 * The id a diagram write reports back.
 *
 * The item shape no longer needs a schema of its own — a row arrives as one of
 * the session-item arms, so "is this a diagram write's result, and what text did
 * it return" is two field reads the compiler checks. What still needs parsing is
 * the tool's own JSON payload, which this union deliberately does not claim to
 * know.
 */
const writtenDiagramId = z.object({
	diagramId: z
		.string()
		.refine((value) => value.trim() !== '')
		.transform((value) => value as DiagramId)
});

const fromResult = (item: PersistedSessionItem): DiagramId | undefined => {
	if (item.type !== 'function_call_result' || !WRITING_TOOLS.has(item.name)) return undefined;
	const text = sessionOutputText(item);
	if (text === undefined) return undefined;
	const payload: unknown = JSON.parse(text);
	return writtenDiagramId.safeParse(payload).data?.diagramId;
};

export class PresentedCanvasSource {
	constructor(private readonly items: CanvasSourceItems) {}

	async latest(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<DiagramId | undefined> {
		// The whole transcript, deliberately unbounded. A window would mean a diagram
		// written long enough ago simply vanishes from the canvas, with nothing to
		// tell anyone it happened.
		const rows = await this.items.list(actor, conversationId);
		for (let index = rows.length - 1; index >= 0; index -= 1) {
			const found = fromResult(rows[index]!.item);
			if (found) return found;
		}
		return undefined;
	}
}
