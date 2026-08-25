import { z } from 'zod';
import type { ActorContext } from '$lib/models/identity';
import type { ConversationId } from '$lib/models/agent';
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
	/**
	 * Mirrors `AgentSessionItem.item`, which is what the adapter has. The precise
	 * type for a session row is the SDK's `AgentInputItem` union, and it cannot be
	 * named here: this port is satisfied by `AgentSessionRepository`, whose row
	 * type lives in `models/agent`, and a model may not import a framework.
	 */
	list(
		actor: ActorContext,
		conversationId: ConversationId,
		limit?: number
	): Promise<readonly { readonly item: Readonly<Record<string, unknown>> }[]>;
}

const WRITING_TOOLS = ['create_diagram', 'edit_diagram'] as const;

/**
 * A session row that is a diagram write's result, and nothing else.
 *
 * Parsed rather than cast: the rows are stored JSON, so `item.output.text` is a
 * claim until something checks it.
 */
const diagramWriteResult = z.object({
	type: z.literal('function_call_result'),
	name: z.enum(WRITING_TOOLS),
	output: z.object({ text: z.string() })
});

const writtenDiagramId = z.object({
	diagramId: z
		.string()
		.refine((value) => value.trim() !== '')
		.transform((value) => value as DiagramId)
});

const fromResult = (item: Readonly<Record<string, unknown>>): DiagramId | undefined => {
	const parsed = diagramWriteResult.safeParse(item);
	if (!parsed.success) return undefined;
	const payload: unknown = JSON.parse(parsed.data.output.text);
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
