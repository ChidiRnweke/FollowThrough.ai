import { z } from 'zod';
type Brand<T, Name extends string> = T & { readonly __brand: Name };

type UserId = Brand<string, 'UserId'>;

type ProjectId = Brand<string, 'ProjectId'>;

type NoteId = Brand<string, 'NoteId'>;

export type DiagramId = Brand<string, 'DiagramId'>;
export type DiagramRevisionId = Brand<string, 'DiagramRevisionId'>;
export type DiagramEtag = Brand<string, 'DiagramEtag'>;

export type DiagramRevisionChange =
	| { readonly kind: 'save'; readonly source: string; readonly searchableText: string }
	| { readonly kind: 'rename'; readonly title: string }
	| {
			readonly kind: 'restore';
			readonly revision: Pick<DiagramRevision, 'title' | 'source' | 'searchableText'>;
	  }
	| {
			readonly kind: 'publish';
			readonly source: string;
			readonly renderedSvg: string;
			readonly searchableText: string;
	  };

export interface DiagramRevisionWrite {
	readonly diagram: DrawioDiagram;
	readonly expectedRevision: number;
	readonly expectedPublishedRevision: number;
}

/** A stored diagram-tool result, read without deciding which canvas is current. */
export type CanvasSessionResult =
	| { readonly kind: 'written'; readonly diagramId: DiagramId }
	| { readonly kind: 'unrelated' }
	| { readonly kind: 'corrupt'; readonly reason: string };

export const diagramWriteResultSchema = z.object({
	diagramId: z
		.string()
		.refine((value) => value.trim() !== '')
		.transform((value) => value as DiagramId)
});

type ConversationId = Brand<string, 'ConversationId'>;

type SourceAnchorId = Brand<string, 'SourceAnchorId'>;

type ProvenanceId = Brand<string, 'ProvenanceId'>;

type DateTime = Brand<string, 'DateTime'>;

interface TextSelection {
	readonly noteId: NoteId;
	readonly revision: number;
	readonly from: number;
	readonly to: number;
	readonly text: string;
}

export type DiagramKind = 'mermaid' | 'drawio';

interface DiagramBase {
	readonly id: DiagramId;
	readonly userId: UserId;
	/** Diagrams are owned by their project; a source note is optional context. */
	readonly projectId: ProjectId;
	/**
	 * The note this diagram was created from, when it was created from one.
	 * Absent for a studio diagram, which is authored in a conversation and belongs
	 * to the project rather than to any note.
	 */
	readonly sourceNoteId?: NoteId;
	/** The studio conversation that produced this diagram, for reopening it. */
	readonly conversationId?: ConversationId;
	readonly title?: string;
	readonly renderedSvg?: string;
	readonly searchableText: string;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly provenanceId?: ProvenanceId;
	/** Set while the diagram is in the trash; absent means active. */
	readonly archivedAt?: DateTime;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

/** A diagram whose editable source is Mermaid text; `renderedSvg` is a cache, not the source of truth. */
export interface MermaidDiagram extends DiagramBase {
	readonly kind: 'mermaid';
	readonly source: string;
}

/**
 * A diagram whose editable source is draw.io XML. `promotedFromId` links back to
 * the Mermaid diagram it was converted from, when it came from a conversion
 * rather than being authored directly.
 */
export interface DrawioDiagram extends DiagramBase {
	readonly kind: 'drawio';
	readonly source: string;
	readonly currentRevision: number;
	readonly publishedRevision: number;
	readonly publishedAt?: DateTime;
	readonly promotedFromId?: DiagramId;
}

export type Diagram = MermaidDiagram | DrawioDiagram;

export interface DiagramRevision {
	readonly id: DiagramRevisionId;
	readonly diagramId: DiagramId;
	readonly revision: number;
	readonly title?: string;
	readonly source: string;
	readonly renderedSvg?: string;
	readonly searchableText: string;
	readonly createdAt: DateTime;
}

export interface DiagramRevisionSummary {
	readonly id: DiagramRevisionId;
	readonly revision: number;
	readonly title?: string;
	readonly createdAt: DateTime;
	readonly isPublished: boolean;
}

export const diagramEtag = (diagram: Pick<DrawioDiagram, 'id' | 'currentRevision'>): DiagramEtag =>
	`diagram:${diagram.id}:r${diagram.currentRevision}` as DiagramEtag;

export interface GenerateMermaidDiagramInput {
	readonly selection: TextSelection;
	readonly instruction?: string;
}

export interface GenerateMermaidDiagramOutput<Proposal> {
	readonly anchorId: SourceAnchorId;
	readonly suggestion: Proposal;
}

export interface ReviseMermaidDiagramInput {
	readonly diagramId: DiagramId;
	readonly instruction: string;
}

export interface ReviseMermaidDiagramOutput {
	readonly diagram: MermaidDiagram;
}

export interface ReviseInlineMermaidInput {
	readonly noteId: NoteId;
	readonly source: string;
	readonly instruction: string;
	readonly renderedPngDataUrl?: string;
}

export interface ReviseInlineMermaidOutput {
	readonly source: string;
	readonly title?: string;
}

export interface ConvertInlineMermaidInput {
	readonly noteId: NoteId;
	readonly source: string;
	readonly instruction?: string;
}

export type StartGenerateMermaidInput = GenerateMermaidDiagramInput & {
	readonly requestId: string;
};
export type StartReviseInlineMermaidInput = ReviseInlineMermaidInput & {
	readonly requestId: string;
};
export type StartConvertInlineMermaidInput = ConvertInlineMermaidInput & {
	readonly requestId: string;
};

const actionNoteIdSchema = z.uuid().transform((value) => value as NoteId);
export const startGenerateMermaidSchema = z
	.object({
		requestId: z.uuid(),
		selection: z
			.object({
				noteId: actionNoteIdSchema,
				revision: z.number().int().positive(),
				from: z.number().int().nonnegative(),
				to: z.number().int().nonnegative(),
				text: z.string()
			})
			.strict()
			.refine(
				(selection) => selection.to >= selection.from,
				'Selection end must follow its start.'
			),
		instruction: z.string().optional()
	})
	.strict() satisfies z.ZodType<StartGenerateMermaidInput>;
export const startReviseInlineMermaidSchema = z
	.object({
		requestId: z.uuid(),
		noteId: actionNoteIdSchema,
		source: z.string(),
		instruction: z.string(),
		renderedPngDataUrl: z.string().max(14_000_000).optional()
	})
	.strict() satisfies z.ZodType<StartReviseInlineMermaidInput>;
export const startConvertInlineMermaidSchema = z
	.object({
		requestId: z.uuid(),
		noteId: actionNoteIdSchema,
		source: z.string().trim().min(1).max(50_000),
		instruction: z.string().trim().max(2_000).optional()
	})
	.strict() satisfies z.ZodType<StartConvertInlineMermaidInput>;

export const diagramActionSubmissionSchema = z.discriminatedUnion('operation', [
	startGenerateMermaidSchema.extend({ operation: z.literal('generate') }),
	startReviseInlineMermaidSchema.extend({ operation: z.literal('revise') }),
	startConvertInlineMermaidSchema.extend({ operation: z.literal('convert') })
]);
export type DiagramActionSubmission = z.infer<typeof diagramActionSubmissionSchema>;

export interface ConvertInlineMermaidOutput<Proposal> {
	readonly suggestion: Proposal;
}

export interface GetProjectDiagramInput {
	readonly diagramId: DiagramId;
}

/**
 * The trash, for one project or for all of them.
 *
 * Its own input rather than reusing `ListProjectDiagramsInput`, whose `projectId`
 * is required: the global trash page is asking across every project, and casting
 * that absence past a required field would be inventing an answer.
 */
export interface ListTrashedDiagramsInput {
	readonly projectId?: ProjectId;
}

export interface ListProjectDiagramsInput {
	readonly projectId: ProjectId;
	readonly kind?: DiagramKind;
	readonly query?: string;
	readonly limit?: number;
	readonly offset?: number;
}

export interface ListProjectDiagramsOutput {
	readonly diagrams: readonly Diagram[];
	readonly total: number;
}

export interface ListProjectDiagramsParams {
	readonly kind?: DiagramKind;
	readonly query?: string;
	readonly limit?: number;
	readonly offset?: number;
}

export interface KeepStudioDiagramInput {
	readonly projectId: ProjectId;
	/**
	 * Also the idempotency key. One studio conversation owns one evolving diagram,
	 * so a replayed event or a reconnect finds the diagram the first call created
	 * instead of making a second one.
	 */
	readonly conversationId: ConversationId;
	/** Uncompressed draw.io XML, as the agent presented it on the canvas. */
	readonly source: string;
	/**
	 * The SVG the draw.io embed exported when the user kept the diagram.
	 *
	 * Required, not optional: nothing outside that embed can render draw.io, so a
	 * diagram stored without one has no preview and no way to ever get one.
	 */
	readonly renderedSvg: string;
	readonly title?: string;
}

export interface KeepStudioDiagramOutput {
	readonly diagram: Diagram;
	/** False when this conversation's diagram already existed. */
	readonly created: boolean;
}

export interface RenameProjectDiagramInput {
	readonly diagramId: DiagramId;
	readonly title: string;
	readonly baseEtag: DiagramEtag;
}

export interface FindConversationDiagramInput {
	readonly conversationId: ConversationId;
}
export interface FindConversationDiagramOutput {
	readonly diagram?: Diagram;
}
export interface SaveProjectDiagramDraftInput {
	readonly diagramId: DiagramId;
	readonly source: string;
	readonly baseEtag: DiagramEtag;
}
export interface PublishProjectDiagramInput {
	readonly diagramId: DiagramId;
	readonly source: string;
	readonly renderedSvg: string;
	readonly baseEtag: DiagramEtag;
}
export type DiagramWriteOutcome =
	| { readonly outcome: 'saved'; readonly diagram: DrawioDiagram; readonly etag: DiagramEtag }
	| {
			readonly outcome: 'conflict';
			readonly baseEtag: DiagramEtag;
			readonly remote: { readonly diagram: DrawioDiagram; readonly etag: DiagramEtag };
	  };
export type PublishProjectDiagramOutput = DiagramWriteOutcome;
export interface ListDiagramRevisionsInput {
	readonly diagramId: DiagramId;
}
export interface ListDiagramRevisionsOutput {
	readonly revisions: readonly DiagramRevisionSummary[];
}
export interface GetDiagramRevisionInput {
	readonly diagramId: DiagramId;
	readonly revisionId: DiagramRevisionId;
}
export interface GetDiagramRevisionOutput {
	readonly revision: DiagramRevision;
}
export interface RestoreDiagramRevisionInput extends GetDiagramRevisionInput {
	readonly baseEtag: DiagramEtag;
}
export type RestoreDiagramRevisionOutput = DiagramWriteOutcome;

export interface DeleteProjectDiagramInput {
	readonly diagramId: DiagramId;
}

export interface CountDiagramReferencesInput {
	readonly diagramId: DiagramId;
}

/** The document both writing tools carry. */
interface DiagramDocument {
	/**
	 * Uncompressed draw.io XML.
	 *
	 * The canvas is draw.io only, by design rather than by omission. Mermaid is
	 * still how the agent iterates — it is cheap to write and cheap to read, so it
	 * belongs in the reply where the user can react to it in one glance. What
	 * reaches the canvas is the settled shape, and only draw.io is editable there,
	 * renderable to a stored preview, and linkable into a note.
	 */
	readonly source: string;
	readonly title?: string;
}

export interface CreateDiagramInput extends DiagramDocument {
	/** Required for the reason `CreateNoteInput.projectId` is: no default can honestly say where a diagram belongs. */
	readonly projectId: ProjectId;
	/** Provenance, so the diagram can reopen the conversation that drew it. */
	readonly conversationId: ConversationId;
}

/**
 * Editing needs the diagram and nothing else.
 *
 * It does not extend the create input. It used to, and so inherited a `projectId`
 * an edit has no business supplying — the diagram already knows which project it
 * is in, and a second answer could only disagree with the first.
 */
export interface EditDiagramInput extends DiagramDocument {
	readonly diagramId: DiagramId;
}

/**
 * What both writing tools answer: which diagram, and what it is called.
 *
 * Not the diagram itself. The source is thousands of tokens of markup the agent
 * just sent, and handing it straight back doubles the cost of every write for
 * something it already has.
 */
export interface DiagramWriteOutput {
	readonly diagramId: DiagramId;
	readonly title?: string;
}

export interface ReadCanvasDiagramInput {
	readonly conversationId: ConversationId;
}

/**
 * What a conversation's canvas is showing.
 *
 * Two states, not three. It used to have an arm for a diagram that existed only
 * on a canvas, because creating one stored nothing; both writing tools store now,
 * so the canvas either names a saved diagram or is empty.
 */
export type ReadCanvasDiagramOutput =
	| {
			readonly kind: 'present';
			readonly diagramId: DiagramId;
			readonly title?: string;
			/** Uncompressed draw.io XML, as stored — not as the agent last sent it. */
			readonly source: string;
	  }
	| {
			readonly kind: 'empty';
			readonly message: string;
			readonly nextActions: readonly [
				{
					readonly tool: 'create_diagram';
					readonly reason: string;
				}
			];
	  };

export interface SearchDiagramIconsInput {
	/**
	 * One term. The icon library matches names, not phrases — "azure app service"
	 * finds nothing where "azure" finds plenty.
	 */
	readonly query: string;
	readonly limit?: number;
}

export interface SearchDiagramIconsOutput {
	readonly icons: readonly { readonly name: string; readonly url: string }[];
}

export interface ReadProjectDiagramInput {
	readonly diagramId: DiagramId;
}

/** A saved diagram as the agent sees it; source is read through its virtual file. */
export interface ReadProjectDiagramOutput {
	readonly id: DiagramId;
	readonly projectId: ProjectId;
	readonly kind: DiagramKind;
	readonly title?: string;
	readonly labels: string;
}

export interface SaveProjectDrawioInput {
	readonly diagramId: DiagramId;
	readonly source: string;
	readonly renderedSvg: string;
}

export interface GetDrawioDiagramInput {
	readonly noteId: NoteId;
	readonly diagramId: DiagramId;
}

export interface SaveDrawioDiagramInput extends GetDrawioDiagramInput {
	readonly source: string;
	readonly renderedSvg: string;
}

export interface SaveDrawioDiagramOutput {
	readonly diagram: DrawioDiagram;
}

export interface PromoteDiagramInput {
	readonly diagramId: DiagramId;
}

export interface PromoteDiagramOutput<Proposal> {
	readonly source: MermaidDiagram;
	readonly suggestion: Proposal;
}

export interface DrawioRevision {
	readonly source: string;
	readonly renderedSvg: string;
}
