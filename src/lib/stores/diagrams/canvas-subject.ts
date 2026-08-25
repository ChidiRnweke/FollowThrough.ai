import { z } from 'zod';
import type { DiagramId } from '$lib/models/diagrams';
import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';

/**
 * A diagram id, parsed rather than asserted.
 *
 * Tool output is whatever crossed the wire, so a malformed record reads as
 * nothing and leaves the last good diagram on the canvas.
 */
const diagramIdField = z
	.string()
	.refine((value) => value.trim() !== '')
	.transform((value) => value as DiagramId);

/** What both writing tools answer with. */
const writtenDiagram = z.object({ diagramId: diagramIdField });

/**
 * A saved diagram named by its id.
 *
 * The `kind` check is what makes this a *diagram* reader rather than an artifact
 * reader: `accept_suggestion` answers for every kind of suggestion, so without it
 * accepting a todo would put that todo on the diagram canvas.
 */
const namedDiagram = z.object({
	id: diagramIdField,
	kind: z.enum(['drawio', 'mermaid'])
});

const readWritten = (output: unknown): DiagramId | undefined =>
	writtenDiagram.safeParse(output).data?.diagramId;

/** A diagram the agent read: the tool answers with the diagram itself. */
const readNamed = (output: unknown): DiagramId | undefined =>
	namedDiagram.safeParse(output).data?.id;

/** A diagram the user accepted: the tool answers with the suggestion it applied. */
const readAccepted = (output: unknown): DiagramId | undefined =>
	z.object({ artifact: namedDiagram }).safeParse(output).data?.artifact.id;

/**
 * Every way a conversation can end up with a diagram to show.
 *
 * Writing one is the direct route. The other two matter because a diagram the
 * agent reached some other way is still the diagram the user is talking about,
 * and leaving them out is what made a whole request end at "Accept suggestion
 * completed" with nothing to look at.
 */
const CANVAS_READERS: Readonly<Record<string, (output: unknown) => DiagramId | undefined>> = {
	create_diagram: readWritten,
	edit_diagram: readWritten,
	accept_suggestion: readAccepted,
	read_project_diagram: readNamed
};

/**
 * The diagram on this conversation's canvas: the last one it touched.
 *
 * A diagram id and nothing else. It used to be a union — a draft the user had not
 * kept, or a saved diagram — because creating one stored nothing and lived only
 * on a canvas. Both tools write now, so there is one kind of answer, and the two
 * representations that could disagree about what the canvas held are one.
 *
 * Read out of the transcript rather than held as separate state, which is what
 * makes a reload or a reconnect show the same canvas: tool calls are replayed
 * with everything else.
 */
export const canvasDiagramId = (tools: readonly ChatToolActivity[]): DiagramId | undefined => {
	for (let index = tools.length - 1; index >= 0; index -= 1) {
		const tool = tools[index]!;
		if (tool.status !== 'succeeded') continue;
		const diagramId = CANVAS_READERS[tool.name]?.(tool.output);
		if (diagramId) return diagramId;
	}
	return undefined;
};
