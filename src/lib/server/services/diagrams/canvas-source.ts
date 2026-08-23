import type { ActorContext } from '$lib/models/identity';
import type { ConversationId } from '$lib/models/agent';
import {
	presentedDiagramFromText,
	type PresentedDiagram
} from '$lib/models/diagrams/presented-canvas';

/**
 * The diagram currently on a conversation's canvas, read back on demand.
 *
 * Diagram source is elided from replayed history — an mxfile is 5–8 KB and rode
 * along on every later turn, several times over, for a document the agent rarely
 * needed to re-read. It is still stored in full; this is how the agent gets it
 * when it actually does, which is immediately before revising.
 *
 * A draft has no diagram row behind it, so `read_project_diagram` cannot answer
 * for one. The session items can.
 */
export interface CanvasSourceItems {
	list(
		actor: ActorContext,
		conversationId: ConversationId,
		limit?: number
	): Promise<readonly { readonly item: Readonly<Record<string, unknown>> }[]>;
}

export type PresentedCanvasDiagram = PresentedDiagram;

const PRESENT_DIAGRAM = 'present_diagram';
const PRESENT_DIAGRAM_REVISION = 'present_diagram_revision';

/** The tool's own result, which is the validated source rather than what it proposed. */
const fromResult = (item: Record<string, unknown>): PresentedCanvasDiagram | undefined => {
	if (
		(item.name !== PRESENT_DIAGRAM && item.name !== PRESENT_DIAGRAM_REVISION) ||
		item.type !== 'function_call_result'
	)
		return undefined;
	const output = item.output as { text?: unknown } | undefined;
	return typeof output?.text === 'string'
		? presentedDiagramFromText(
				output.text,
				item.name === PRESENT_DIAGRAM_REVISION ? 'revision' : 'new'
			)
		: undefined;
};

export class PresentedCanvasSource {
	constructor(private readonly items: CanvasSourceItems) {}

	async latest(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<PresentedCanvasDiagram | undefined> {
		// The whole transcript, deliberately unbounded. A window would mean a diagram
		// presented long enough ago simply vanishes from the canvas, with nothing to
		// tell anyone it happened.
		const rows = await this.items.list(actor, conversationId);
		for (let index = rows.length - 1; index >= 0; index -= 1) {
			const found = fromResult(rows[index]!.item as Record<string, unknown>);
			if (found) return found;
		}
		return undefined;
	}
}
