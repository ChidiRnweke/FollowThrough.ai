import type {
	DiagramSize,
	ExportDiagramImages,
	ExportSettings,
	ExportDownload,
	GenerateDocumentInput,
	GenerateBundleInput,
	GenerateBundleOutput,
	PreviewDocumentInput,
	PreviewDocumentOutput
} from '$lib/models/deliverables';
import type { MermaidSvgRenderer, MermaidTheme } from '$lib/models/diagrams/mermaid-theme';
import type { ProseMirrorDocument, NoteId } from '$lib/models/notes';
import type { ProjectId, ProjectExportEntry } from '$lib/models/projects';
import type { ExportPreparation } from '$lib/services/deliverables/export-preparation';
import type { MermaidThemeRules } from '$lib/services/diagrams/mermaid-theme';
import type { DocumentExportStore } from '$lib/stores/deliverables/export.svelte';

export interface ExportDiagramImageAdapter {
	rasterize(svg: string): Promise<string | null>;
	hash(value: string): Promise<string>;
}
export interface DocumentExportRemote {
	generate(input: GenerateDocumentInput): Promise<{ readonly downloadUrl: string }>;
	bundle(input: GenerateBundleInput): Promise<GenerateBundleOutput>;
	preview(input: PreviewDocumentInput): Promise<PreviewDocumentOutput>;
}
export interface DocumentPreviewUrls {
	create(data: string): string;
	release(url: string): void;
}
export interface BrowserDocumentExportInput {
	readonly projectId: string;
	readonly noteIds: readonly string[];
	readonly title: string;
	readonly settings: ExportSettings;
	readonly documents: readonly { readonly document: ProseMirrorDocument }[];
	readonly diagrams: readonly { readonly id: string; readonly renderedSvg?: string }[];
}
export interface BrowserBundleExportInput {
	readonly projectId: string;
	readonly entries: readonly ProjectExportEntry[];
	readonly title: string;
	readonly settings: ExportSettings;
	readonly format: 'docx' | 'pdf';
	readonly bundle: 'zip' | 'merged';
	/** The selected notes, read from this device in the order of `entries`. */
	readonly documents: readonly { readonly document: ProseMirrorDocument }[];
}
/**
 * Render a document's diagrams in this browser, then have the server lay out the document.
 * Diagrams are rendered here because the server has no browser to draw them in.
 */
export interface DocumentExportController {
	readonly busy: boolean;
	readonly error: string;
	readonly result: ExportDownload | null;
	readonly previewUrl: string;
	/** Start a dialog's export; a late answer for an earlier dialog is dropped. */
	open(): void;
	inspect(documents: readonly { readonly document: ProseMirrorDocument }[]): {
		readonly hasDiagrams: boolean;
		readonly hasSelfStyledDiagrams: boolean;
	};
	preview(input: BrowserDocumentExportInput): Promise<void>;
	generate(input: BrowserDocumentExportInput & { readonly format: 'docx' | 'pdf' }): Promise<void>;
	bundle(input: BrowserBundleExportInput): Promise<void>;
	close(): void;
}
export class DocumentExports implements DocumentExportController {
	constructor(
		private readonly state: DocumentExportStore,
		private readonly preparation: ExportPreparation,
		private readonly themes: MermaidThemeRules,
		private readonly mermaid: MermaidSvgRenderer,
		private readonly images: ExportDiagramImageAdapter,
		private readonly remote: DocumentExportRemote,
		private readonly urls: DocumentPreviewUrls
	) {}
	get busy(): boolean {
		return this.state.busy;
	}
	get error(): string {
		return this.state.error;
	}
	get result(): ExportDownload | null {
		return this.state.result;
	}
	get previewUrl(): string {
		return this.state.previewUrl;
	}
	open(): void {
		this.close();
		this.state.open();
	}
	inspect(documents: readonly { readonly document: ProseMirrorDocument }[]) {
		const sources = this.sources(documents);
		return {
			hasDiagrams: sources.length > 0,
			hasSelfStyledDiagrams: sources.some((source) => this.themes.keepsOwnColours(source))
		};
	}
	async preview(input: BrowserDocumentExportInput): Promise<void> {
		await this.run(input.title, 'Preview failed', async (current) => {
			const renders = await this.render(input.documents, input.diagrams, input.settings);
			if (!current()) return;
			const output = await this.remote.preview({
				projectId: input.projectId as ProjectId,
				noteIds: input.noteIds.map((id) => id as NoteId),
				title: input.title.trim(),
				settings: input.settings,
				diagramSvgs: renders.svgs,
				diagramPngs: renders.pngs,
				diagramSizes: renders.sizes
			});
			if (!current()) return;
			const url = this.urls.create(output.data);
			if (this.state.previewUrl) this.urls.release(this.state.previewUrl);
			this.state.showPreview(url);
		});
	}
	async generate(
		input: BrowserDocumentExportInput & { readonly format: 'docx' | 'pdf' }
	): Promise<void> {
		await this.run(input.title, 'Export failed', async (current) => {
			const renders = await this.render(input.documents, input.diagrams, input.settings);
			if (!current()) return;
			const output = await this.remote.generate({
				projectId: input.projectId as ProjectId,
				noteIds: input.noteIds.map((id) => id as NoteId),
				title: input.title.trim(),
				format: input.format,
				settings: input.settings,
				diagramSvgs: renders.svgs,
				diagramPngs: renders.pngs,
				diagramSizes: renders.sizes
			});
			if (current()) this.state.publish({ url: output.downloadUrl, fileCount: 1 });
		});
	}
	async bundle(input: BrowserBundleExportInput): Promise<void> {
		if (!input.entries.length) return;
		await this.run(input.title, 'Export failed', async (current) => {
			const renders = await this.render(input.documents, [], input.settings);
			if (!current()) return;
			const common = {
				projectId: input.projectId as ProjectId,
				title: input.title.trim(),
				format: input.format,
				settings: input.settings,
				diagramSvgs: renders.svgs,
				diagramPngs: renders.pngs,
				diagramSizes: renders.sizes
			};
			if (input.bundle === 'zip') {
				const output = await this.remote.bundle({
					...common,
					entries: input.entries.map((entry) => ({ noteId: entry.id as NoteId, path: entry.path }))
				});
				if (current()) this.state.publish({ url: output.downloadUrl, fileCount: output.fileCount });
			} else {
				const output = await this.remote.generate({
					...common,
					noteIds: input.entries.map((entry) => entry.id as NoteId)
				});
				if (current()) this.state.publish({ url: output.downloadUrl, fileCount: 1 });
			}
		});
	}
	private async run(
		title: string,
		failure: string,
		operation: (current: () => boolean) => Promise<void>
	): Promise<void | { readonly kind: 'failure'; readonly message: string }> {
		if (!title.trim() || this.busy) return;
		const generation = this.state.generation;
		const current = () => generation === this.state.generation;
		this.state.begin();
		try {
			await operation(current);
		} catch (cause) {
			const message = cause instanceof Error ? cause.message : failure;
			if (current()) this.state.fail(message);
			return { kind: 'failure', message };
		} finally {
			if (current()) this.state.finish();
		}
	}
	close(): void {
		if (this.state.previewUrl) this.urls.release(this.state.previewUrl);
		this.state.close();
	}

	// ----- Diagrams, drawn here and handed to the server as images -----

	private sources(documents: readonly { document: ProseMirrorDocument }[]): string[] {
		return documents.flatMap(({ document }) =>
			this.preparation
				.assets(document)
				.diagrams.flatMap((diagram) => (diagram.kind === 'mermaid' ? [diagram.source] : []))
		);
	}
	private async render(
		documents: readonly { document: ProseMirrorDocument }[],
		diagrams: readonly { readonly id: string; readonly renderedSvg?: string }[],
		settings: ExportSettings
	): Promise<ExportDiagramImages> {
		const ids = new Set(
			documents.flatMap(({ document }) =>
				this.preparation
					.assets(document)
					.diagrams.flatMap((diagram) => (diagram.kind === 'drawio' ? [diagram.diagramId] : []))
			)
		);
		const referenced = [...ids].flatMap((id) => {
			const diagram = diagrams.find((diagram) => diagram.id === id);
			return diagram ? [diagram] : [];
		});
		const [mermaid, drawio] = await Promise.all([
			this.renderMermaid(this.sources(documents), settings),
			this.renderDrawio(referenced)
		]);
		return {
			svgs: { ...mermaid.svgs, ...drawio.svgs },
			pngs: { ...mermaid.pngs, ...drawio.pngs },
			sizes: { ...mermaid.sizes, ...drawio.sizes }
		};
	}
	private async renderDrawio(
		diagrams: readonly { readonly id: string; readonly renderedSvg?: string }[]
	): Promise<ExportDiagramImages> {
		const svgs: Record<string, string> = {};
		const pngs: Record<string, string> = {};
		const sizes: Record<string, DiagramSize> = {};
		// Rasterized together: each diagram's SVG is already laid out, so they have no
		// bearing on each other and a serial loop just waited on each in turn.
		const rendered = await Promise.all(
			diagrams
				.filter((diagram) => diagram.renderedSvg)
				.map(async (diagram) => ({
					diagram,
					png: await this.images.rasterize(diagram.renderedSvg!)
				}))
		);
		for (const { diagram, png } of rendered) {
			const size = this.preparation.diagramSize(diagram.renderedSvg!);
			if (size) sizes[diagram.id] = size;
			if (png) pngs[diagram.id] = png;
			else svgs[diagram.id] = diagram.renderedSvg!;
		}
		return { svgs, pngs, sizes };
	}

	private async renderMermaid(
		sources: readonly string[],
		settings: ExportSettings
	): Promise<ExportDiagramImages> {
		if (sources.length === 0) return { svgs: {}, pngs: {}, sizes: {} };
		const svgs: Record<string, string> = {};
		const pngs: Record<string, string> = {};
		const sizes: Record<string, DiagramSize> = {};
		// Diagrams follow the export's own palette, never the reader's colour mode: the
		// document lands somewhere we do not control, and a dark-mode render is unusable
		// on paper. Defaults to light for the same reason.
		const theme: MermaidTheme = {
			base: settings.diagramTheme?.base ?? 'light',
			...(settings.diagramTheme?.colors ? { palette: settings.diagramTheme.colors } : {})
		};
		for (const source of sources) {
			try {
				const markup = await this.mermaid.render(
					`export-diagram-${crypto.randomUUID()}`,
					source,
					this.themes.resolve(theme).config,
					'document'
				);
				const hash = await this.images.hash(source);
				const size = this.preparation.diagramSize(markup);
				if (size) sizes[hash] = size;
				const png = await this.images.rasterize(markup);
				if (png) pngs[hash] = png;
				else svgs[hash] = markup;
			} catch (error) {
				throw new Error('A diagram could not be rendered for export', { cause: error });
			}
		}
		return { svgs, pngs, sizes };
	}
}
