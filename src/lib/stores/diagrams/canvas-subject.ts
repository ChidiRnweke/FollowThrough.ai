import { z } from 'zod';
import type { DiagramId } from '$lib/models/diagrams';
import {
	presentedDiagram,
	presentedDiagramRevision,
	type PresentedDiagram
} from '$lib/models/diagrams/presented-canvas';
import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';

export type { PresentedDiagram };

/**
 * What the canvas should be showing: something the agent drew and the user has
 * not kept, or a diagram that is already saved.
 */
export type CanvasSubject =
	| { readonly kind: 'draft'; readonly draft: PresentedDiagram }
	| { readonly kind: 'saved'; readonly diagramId: DiagramId };

const diagramIdField = z
	.string()
	.refine((value) => value.trim() !== '')
	.transform((value) => value as DiagramId);

/**
 * A saved diagram named by its id.
 *
 * The `kind` check is what makes this a *diagram* reader rather than an artifact
 * reader: `accept_suggestion` answers for every kind of suggestion, so without it
 * accepting a todo would put that todo on the diagram canvas.
 */
const savedDiagramFields = z.object({
	id: diagramIdField,
	kind: z.enum(['drawio', 'mermaid'])
});

const readDraft = (output: unknown): CanvasSubject | undefined => {
	const draft = presentedDiagram(output);
	return draft ? { kind: 'draft', draft } : undefined;
};

const readRevision = (output: unknown): CanvasSubject | undefined => {
	const draft = presentedDiagramRevision(output);
	return draft ? { kind: 'draft', draft } : undefined;
};

/** A diagram the agent read: the tool answers with the diagram itself. */
const readSavedDiagram = (output: unknown): CanvasSubject | undefined => {
	const parsed = savedDiagramFields.safeParse(output);
	return parsed.success ? { kind: 'saved', diagramId: parsed.data.id } : undefined;
};

/** A diagram the user accepted: the tool answers with the suggestion it applied. */
const readAcceptedArtifact = (output: unknown): CanvasSubject | undefined => {
	const parsed = z.object({ artifact: savedDiagramFields }).safeParse(output);
	return parsed.success ? { kind: 'saved', diagramId: parsed.data.artifact.id } : undefined;
};

/**
 * Every way a conversation can end up with something to show on the canvas.
 *
 * `present_diagram` is the direct one. The other two matter because a diagram
 * the agent saved through some other route is still a diagram the user is
 * talking about, and leaving it out is what made a whole request end at
 * "Accept suggestion completed" with nothing to look at.
 */
const SUBJECT_READERS: Readonly<Record<string, (output: unknown) => CanvasSubject | undefined>> = {
	present_diagram: readDraft,
	present_diagram_revision: readRevision,
	accept_suggestion: readAcceptedArtifact,
	read_project_diagram: readSavedDiagram
};

/**
 * The diagram currently on the canvas: the last one this conversation produced.
 *
 * The transcript is the studio's storage before anything is kept, so this reads
 * back out of it rather than holding separate state — which is also what makes a
 * reload or a reconnect show the same canvas, since tool calls are replayed with
 * everything else.
 */
export const canvasSubject = (tools: readonly ChatToolActivity[]): CanvasSubject | undefined => {
	for (let index = tools.length - 1; index >= 0; index -= 1) {
		const tool = tools[index]!;
		if (tool.status !== 'succeeded') continue;
		const subject = SUBJECT_READERS[tool.name]?.(tool.output);
		if (subject) return subject;
	}
	return undefined;
};

/**
 * What the canvas has been opened for, as one comparable value.
 *
 * A draft is identified by its source, so re-rendering the same draft never
 * re-opens the canvas but a revision does; a saved diagram is identified by its
 * id, so reading it twice is one subject rather than two.
 *
 * Total over a subject. It used to accept and return `undefined`, which meant
 * "there is nothing on the canvas" travelled down through here and into
 * `shouldOpenCanvas` and `markCanvasShown`, each of which then needed a branch
 * for a case it could do nothing about. The caller that knows whether there is
 * a subject is the caller that should decide.
 */
export const canvasSubjectKey = (subject: CanvasSubject): string =>
	subject.kind === 'draft' ? `draft:${subject.draft.source}` : `saved:${subject.diagramId}`;
