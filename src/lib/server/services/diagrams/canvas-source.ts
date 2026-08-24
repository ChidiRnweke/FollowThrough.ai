import { z } from 'zod';
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
	/**
	 * Mirrors `AgentSessionItem.item`, which is what the adapter has.
	 *
	 * The precise type for a session row is the SDK's `AgentInputItem` union, and
	 * `ConversationBuffer` narrows on it directly. It cannot be named here: this
	 * port is satisfied by `AgentSessionRepository`, whose row type lives in
	 * `models/agent`, and a model may not import a framework. Precision is
	 * recovered at the only place that needs it — `fromResult` parses the row into
	 * `PresentationResult` rather than indexing into unchecked fields.
	 */
	list(
		actor: ActorContext,
		conversationId: ConversationId,
		limit?: number
	): Promise<readonly { readonly item: Readonly<Record<string, unknown>> }[]>;
}

export type PresentedCanvasDiagram = PresentedDiagram;

const PRESENT_DIAGRAM = 'present_diagram';
const PRESENT_DIAGRAM_REVISION = 'present_diagram_revision';

/**
 * A session row that carries a presentation result, and nothing else.
 *
 * Parsed rather than cast: the rows are stored JSON, so `item.output.text` is a
 * claim until something checks it. The name is part of the schema because which
 * reader the text needs depends on which tool produced it.
 */
const presentationResult = z.object({
	type: z.literal('function_call_result'),
	name: z.enum([PRESENT_DIAGRAM, PRESENT_DIAGRAM_REVISION]),
	output: z.object({ text: z.string() })
});

/**
 * A session row that is a presentation result — the narrow shape this service
 * actually deals in, recovered from the row's untyped JSON exactly once.
 */
type PresentationResult = z.infer<typeof presentationResult>;

/** The tool's own result, which is the validated source rather than what it proposed. */
const presentedFrom = (result: PresentationResult): PresentedCanvasDiagram | undefined =>
	presentedDiagramFromText(
		result.output.text,
		result.name === PRESENT_DIAGRAM_REVISION ? 'revision' : 'draft'
	);

const fromResult = (
	item: Readonly<Record<string, unknown>>
): PresentedCanvasDiagram | undefined => {
	const parsed = presentationResult.safeParse(item);
	return parsed.success ? presentedFrom(parsed.data) : undefined;
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
			const found = fromResult(rows[index]!.item);
			if (found) return found;
		}
		return undefined;
	}
}
