import { z } from 'zod';

type Brand<T, Name extends string> = T & { readonly __brand: Name };
type DiagramId = Brand<string, 'DiagramId'>;

/**
 * A diagram the agent put on the canvas.
 *
 * Two arms rather than one shape with an optional `diagramId`. The pair was
 * illegal-states-representable: `diagramId` was absent exactly when the
 * presentation was new, so it stated one fact twice while leaving
 * `{ new, diagramId }` sayable. It cost a real defect — a revision read as a
 * plain draft, lost the row it belonged to, and was routed to a canvas tab that
 * never opened, so the user was told the diagram had changed and saw nothing.
 *
 * A draft has no row behind it and nothing is stored until the user keeps it. A
 * revision names the row it revises, which is where it is shown and saved.
 *
 * There is no diagram `kind`: the canvas is draw.io. Mermaid is how the agent
 * iterates in the reply, where it is cheap to read and cheap to react to; what
 * reaches the canvas is the settled shape, and only draw.io is editable there,
 * renderable to a stored preview, and linkable into a note.
 */
export type PresentedDiagram =
	| {
			readonly kind: 'draft';
			/** Uncompressed draw.io XML. */
			readonly source: string;
			readonly title?: string;
	  }
	| {
			readonly kind: 'revision';
			/** Uncompressed draw.io XML. */
			readonly source: string;
			readonly title?: string;
			/** The saved diagram this version revises. */
			readonly diagramId: DiagramId;
	  };

/**
 * Refined rather than trimmed: the source is handed on to the validator, which
 * owns what a well-formed document is, so this must not quietly rewrite it.
 */
const presentText = z.string().refine((value) => value.trim() !== '');

/**
 * A title that is present but unusable drops out instead of failing the parse.
 * The source is the payload; losing the whole diagram over its name would turn a
 * cosmetic defect into an empty canvas.
 */
const presentTitle = presentText.optional().catch(undefined);

const draftFields = z.object({ source: presentText, title: presentTitle });

const revisionFields = z.object({
	source: presentText,
	title: presentTitle,
	diagramId: presentText.transform((value) => value as DiagramId)
});

/** Spread form, because `exactOptionalPropertyTypes` distinguishes absent from `undefined`. */
const withTitle = (title: string | undefined): { title?: string } =>
	title === undefined ? {} : { title };

/**
 * Read a `present_diagram` payload, wherever it is being read from.
 *
 * One reader, because there were three — the client store walking tool activity,
 * the server reading session rows for `read_canvas_diagram`, and the conversation
 * buffer eliding the source on its way to the model. The two that answered "what
 * is on the canvas" had already drifted apart, so the agent could be handed a
 * different diagram than the user was looking at.
 *
 * Tool output is whatever crossed the wire, so it is parsed here rather than
 * trusted: a malformed record reads as nothing, leaving the last good one in
 * place. Parsed with a schema rather than hand-written `unknown` guards so the
 * result carries its own type instead of a `Record<string, unknown>` that every
 * caller has to re-narrow.
 */
export const presentedDiagram = (output: unknown): PresentedDiagram | undefined => {
	const parsed = draftFields.safeParse(output);
	if (!parsed.success) return undefined;
	return { kind: 'draft', source: parsed.data.source, ...withTitle(parsed.data.title) };
};

/** Read the result of the revision-only presentation boundary. */
export const presentedDiagramRevision = (output: unknown): PresentedDiagram | undefined => {
	const parsed = revisionFields.safeParse(output);
	if (!parsed.success) return undefined;
	return {
		kind: 'revision',
		source: parsed.data.source,
		diagramId: parsed.data.diagramId,
		...withTitle(parsed.data.title)
	};
};

/** The same payload as it is stored in a transcript: JSON in a text field. */
export const presentedDiagramFromText = (
	text: string,
	kind: PresentedDiagram['kind'] = 'draft'
): PresentedDiagram | undefined => {
	const output: unknown = JSON.parse(text);
	return kind === 'revision' ? presentedDiagramRevision(output) : presentedDiagram(output);
};
