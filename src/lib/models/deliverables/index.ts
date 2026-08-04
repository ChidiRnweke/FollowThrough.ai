type Brand<T, Name extends string> = T & { readonly __brand: Name };

type UserId = Brand<string, 'UserId'>;

type ProjectId = Brand<string, 'ProjectId'>;

type NoteId = Brand<string, 'NoteId'>;

type ProvenanceId = Brand<string, 'ProvenanceId'>;

type AgentRunId = Brand<string, 'AgentRunId'>;

export type ArtifactId = Brand<string, 'ArtifactId'>;

export type TemplateId = Brand<string, 'TemplateId'>;

type DateTime = Brand<string, 'DateTime'>;

export interface ExtractedTemplateStyles {
	readonly fonts: {
		readonly heading: Record<
			string,
			{ name: string; size: number; bold: boolean; italic: boolean; color?: string }
		>;
		readonly body: { name: string; size: number; color?: string };
	};
	readonly pageMargins: { top: number; bottom: number; left: number; right: number };
	readonly headerImages?: string[];
	readonly footerContent?: string;
	readonly themeColors: Record<string, string>;
}

/**
 * A generated document (PDF or DOCX) produced from one or more notes. Carries
 * `sourceNoteIds` and an optional `provenanceId`/`runId` so an artifact is always
 * traceable back to the notes and the run that produced it, never a bare file.
 */
export interface Artifact {
	readonly id: ArtifactId;
	readonly userId: UserId;
	readonly projectId: ProjectId;
	readonly title: string;
	readonly format: 'docx' | 'pdf';
	readonly objectKey: string;
	readonly byteSize: number;
	readonly sourceNoteIds: NoteId[];
	readonly templateId?: TemplateId;
	readonly provenanceId?: ProvenanceId;
	readonly runId?: AgentRunId;
	readonly createdAt: DateTime;
}

/**
 * An `Artifact` plus display context. `stale` is what tells a reader the source
 * note changed after this artifact was generated, without them having to diff it.
 */
export interface ArtifactView {
	readonly id: ArtifactId;
	readonly userId: UserId;
	readonly projectId: ProjectId;
	readonly title: string;
	readonly format: 'docx' | 'pdf';
	readonly objectKey: string;
	readonly byteSize: number;
	readonly sourceNoteIds: NoteId[];
	readonly templateId?: TemplateId;
	readonly provenanceId?: ProvenanceId;
	readonly runId?: AgentRunId;
	readonly createdAt: DateTime;
	readonly projectName: string;
	readonly templateName?: string;
	/** True when a source note changed after this artifact was generated. */
	readonly stale?: boolean;
}

export interface ListArtifactsOutput {
	readonly artifacts: readonly ArtifactView[];
	readonly total: number;
}

export interface ListArtifactsParams {
	readonly query?: string;
	readonly limit?: number;
	readonly offset?: number;
}

export type ExportFontFamily = 'helvetica' | 'times' | 'courier';

/**
 * Palette for diagrams embedded in an exported document.
 *
 * Hex values only: mermaid's colour library cannot parse `oklch()`, so the app's tokens
 * reach it as the hex equivalents in `mermaid-rendering.ts`. Absent keys fall back to
 * `base`, and `base` itself defaults to light — a document is read on paper more often
 * than on a dark screen.
 */
export interface ExportDiagramTheme {
	readonly base: 'light' | 'dark';
	readonly colors?: Readonly<Record<string, string>>;
}

export interface ExportSettings {
	readonly fontFamily: ExportFontFamily;
	/** Body font size in points. */
	readonly fontSize: number;
	/** Line height multiplier. */
	readonly lineHeight: number;
	/** Page margin in points, applied to all sides. */
	readonly margin: number;
	/** Render the file name as a heading on the first page. Omitted means off. */
	readonly includeTitle?: boolean;
	/** How embedded diagrams are coloured. Omitted means the light preset. */
	readonly diagramTheme?: ExportDiagramTheme;
}

export const defaultExportSettings: ExportSettings = {
	fontFamily: 'helvetica',
	fontSize: 11,
	lineHeight: 1.35,
	margin: 72,
	includeTitle: false,
	diagramTheme: { base: 'light' }
};

/** Intended display size of a diagram, in SVG user units. */
export interface DiagramSize {
	readonly width: number;
	readonly height: number;
}

/**
 * Natural size of an SVG, from its viewBox.
 *
 * Lives here rather than beside either generator because both sides of the export need it:
 * the browser reads it off its own render to send `diagramSizes`, and the server falls back
 * to it for any caller that still ships the full markup.
 */
export function svgViewBoxSize(svg: string): DiagramSize | undefined {
	const viewBox = /viewBox="([\d.\s-]+)"/.exec(svg)?.[1]?.trim().split(/\s+/).map(Number);
	if (viewBox?.length === 4 && viewBox[2]! > 0 && viewBox[3]! > 0) {
		return { width: viewBox[2]!, height: viewBox[3]! };
	}
	return undefined;
}

/**
 * Browser-rendered diagrams travelling with an export request, keyed by SHA-256 of the
 * diagram source.
 *
 * The raster is the reference rendering that both formats embed, and it is the only thing
 * normally sent: `diagramSizes` carries the viewBox the raster should be displayed at, and
 * `diagramSvgs` is populated only for diagrams the browser failed to rasterize, where the PDF
 * still has an SVG path to fall back to. Sending both for every diagram doubled the request
 * body for no gain.
 */
export interface DiagramRenders {
	readonly diagramSvgs?: Record<string, string>;
	readonly diagramPngs?: Record<string, string>;
	readonly diagramSizes?: Record<string, DiagramSize>;
}

export interface GenerateDocumentInput extends DiagramRenders {
	readonly projectId: ProjectId;
	readonly noteIds: NoteId[];
	readonly title: string;
	readonly format: 'docx' | 'pdf';
	readonly templateId?: TemplateId;
	readonly settings?: ExportSettings;
}

export interface PreviewDocumentInput extends DiagramRenders {
	readonly projectId: ProjectId;
	readonly noteIds: NoteId[];
	readonly title: string;
	readonly settings?: ExportSettings;
}

export interface PreviewDocumentOutput {
	/** Base64-encoded PDF bytes. */
	readonly data: string;
}

export interface GenerateDocumentOutput {
	readonly artifact: Artifact;
	readonly downloadUrl: string;
}

export interface GetArtifactDownloadOutput {
	readonly url: string;
}

export interface RegenerateArtifactOutput {
	readonly artifact: Artifact;
	readonly downloadUrl: string;
}
