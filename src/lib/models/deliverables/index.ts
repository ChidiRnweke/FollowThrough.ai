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

export interface GenerateDocumentInput {
	readonly projectId: ProjectId;
	readonly noteIds: NoteId[];
	readonly title: string;
	readonly format: 'docx' | 'pdf';
	readonly templateId?: TemplateId;
	readonly settings?: ExportSettings;
	/** Mermaid SVGs pre-rendered by the browser, keyed by SHA-256 of the diagram source. */
	readonly diagramSvgs?: Record<string, string>;
	/** PNG rasters of the same diagrams, keyed identically; DOCX embeds the raster. */
	readonly diagramPngs?: Record<string, string>;
}

export interface PreviewDocumentInput {
	readonly projectId: ProjectId;
	readonly noteIds: NoteId[];
	readonly title: string;
	readonly settings?: ExportSettings;
	readonly diagramSvgs?: Record<string, string>;
	readonly diagramPngs?: Record<string, string>;
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
