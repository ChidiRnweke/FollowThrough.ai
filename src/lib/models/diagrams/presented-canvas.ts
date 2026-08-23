type Brand<T, Name extends string> = T & { readonly __brand: Name };
type DiagramId = Brand<string, 'DiagramId'>;

/**
 * A diagram the agent put on the canvas. Nothing is stored until it is kept.
 *
 * There is no `kind`: the canvas is draw.io. Mermaid is how the agent iterates in
 * the reply, where it is cheap to read and cheap to react to; what reaches the
 * canvas is the settled shape, and only draw.io is editable there, renderable to
 * a stored preview, and linkable into a note.
 */
export interface PresentedDiagram {
	/** Uncompressed draw.io XML. */
	readonly source: string;
	readonly title?: string;
	/** The saved diagram this version replaces, when it is a revision. */
	readonly diagramId?: DiagramId;
}

const nonEmpty = (value: unknown): value is string =>
	typeof value === 'string' && value.trim() !== '';

const record = (value: unknown): Record<string, unknown> | undefined =>
	typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;

/**
 * Read a `present_diagram` payload, wherever it is being read from.
 *
 * One reader, because there were three — the client store walking tool activity,
 * the server reading session rows for `read_canvas_diagram`, and the conversation
 * buffer eliding the source on its way to the model. The two that answered "what
 * is on the canvas" had already drifted apart, so the agent could be handed a
 * different diagram than the user was looking at.
 *
 * Tool output is whatever crossed the wire, so it is re-checked here rather than
 * trusted: a malformed record reads as nothing, leaving the last good one in
 * place.
 */
export const presentedDiagram = (output: unknown): PresentedDiagram | undefined => {
	const fields = record(output);
	if (!fields || !nonEmpty(fields.source)) return undefined;
	return {
		source: fields.source,
		...(nonEmpty(fields.title) ? { title: fields.title } : {})
	};
};

/** Read the result of the revision-only presentation boundary. */
export const presentedDiagramRevision = (output: unknown): PresentedDiagram | undefined => {
	const fields = record(output);
	const draft = presentedDiagram(output);
	if (!draft || !nonEmpty(fields?.diagramId)) return undefined;
	return { ...draft, diagramId: fields.diagramId as DiagramId };
};

/** The same payload as it is stored in a transcript: JSON in a text field. */
export const presentedDiagramFromText = (
	text: string,
	kind: 'new' | 'revision' = 'new'
): PresentedDiagram | undefined => {
	const output = JSON.parse(text);
	return kind === 'revision' ? presentedDiagramRevision(output) : presentedDiagram(output);
};
