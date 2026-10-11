import type {
	ClipboardSource,
	ClipboardAsset,
	ClipboardIssue,
	ClipboardTransferReport,
	RichClipboardContent
} from '$lib/models/clipboard';
import type {
	MermaidImageOutput,
	MermaidSvgRenderer,
	MermaidTheme
} from '$lib/models/diagrams/mermaid-theme';
import type { MermaidThemeRules } from '$lib/services/diagrams/mermaid-theme';

export interface ClipboardDocument {
	readonly assets: readonly ClipboardAsset[];
	embed(id: string, image: Blob): Promise<void>;
	markUnavailable(id: string): void;
	content(): RichClipboardContent;
}

export interface ClipboardWriter {
	writeRich(content: Promise<RichClipboardContent>): Promise<void>;
	writeImage(image: Promise<Blob>, text: string): Promise<void>;
	writeText(text: string): Promise<void>;
}

export interface ClipboardDependencies {
	writer: ClipboardWriter;
	document(content: RichClipboardContent): ClipboardDocument;
	readImage(source: string): Promise<Blob>;
	/** Diagrams are copied as images drawn in the reader's current colour mode. */
	mermaid: {
		readonly themes: MermaidThemeRules;
		readonly renderer: MermaidSvgRenderer;
		readonly output: MermaidImageOutput;
		theme(): MermaidTheme;
	};
}

/** Copy a note selection with its images and diagrams; media that fails is marked, not lost. */
export interface NoteClipboardController {
	copy(source: ClipboardSource): Promise<ClipboardTransferReport>;
}

export class ClipboardTransfer implements NoteClipboardController {
	constructor(private readonly dependencies: ClipboardDependencies) {}

	private async renderDiagram(source: string): Promise<Blob> {
		const { themes, renderer, output, theme } = this.dependencies.mermaid;
		const appearance = themes.resolve(theme());
		const svg = await renderer.render(
			`mermaid-export-${crypto.randomUUID()}`,
			source,
			appearance.config,
			'screen'
		);
		return output.blob(await output.rasterise(svg, appearance.background, output.pixelRatio()));
	}

	/** Start the native write before awaiting media so the user's activation is retained. */
	async copy(source: ClipboardSource): Promise<ClipboardTransferReport> {
		if (source.kind === 'rich') {
			const prepared = this.prepareRich(source);
			try {
				await this.dependencies.writer.writeRich(prepared.then((result) => result.content));
				const { issues } = await prepared;
				const [first, ...rest] = issues;
				return first ? { kind: 'degraded', issues: [first, ...rest] } : { kind: 'complete' };
				// chisel-ignore fail-loudly:silent-catch -- copyTextAfterFailure returns a degraded/failure report; the note clipboard adapter displays the text-only warning or write failure.
			} catch (error) {
				return this.copyTextAfterFailure(source.text, {
					kind: 'formatting',
					message: error instanceof Error ? error.message : 'Formatted copy failed'
				});
			}
		}
		try {
			const image =
				source.kind === 'image'
					? this.dependencies.readImage(source.source)
					: this.renderDiagram(source.source);
			await this.dependencies.writer.writeImage(image, source.text);
			return { kind: 'complete' };
			// chisel-ignore fail-loudly:silent-catch -- the copied text marks the unavailable image/diagram and the returned degraded/failure report is displayed by the note clipboard adapter.
		} catch (error) {
			const label = source.kind === 'image' ? 'Image' : 'Diagram';
			return this.copyTextAfterFailure(
				`[${label} unavailable]${source.text ? `\n${source.text}` : ''}`,
				{
					kind: source.kind,
					message: error instanceof Error ? error.message : `${label} could not be copied`
				}
			);
		}
	}

	private async prepareRich(
		source: RichClipboardContent
	): Promise<{ content: RichClipboardContent; issues: ClipboardIssue[] }> {
		const document = this.dependencies.document(source);
		const issues: ClipboardIssue[] = [];
		for (const asset of document.assets) {
			try {
				const image =
					asset.kind === 'image'
						? await this.dependencies.readImage(asset.source)
						: await this.renderDiagram(asset.source);
				await document.embed(asset.id, image);
				// chisel-ignore fail-loudly:silent-catch -- markUnavailable inserts a visible placeholder into the copied document; the returned issues produce the note clipboard warning.
			} catch (error) {
				document.markUnavailable(asset.id);
				issues.push({
					kind: asset.kind,
					message: error instanceof Error ? error.message : 'Media could not be copied'
				});
			}
		}
		return { content: document.content(), issues };
	}

	private async copyTextAfterFailure(
		text: string,
		issue: ClipboardIssue
	): Promise<ClipboardTransferReport> {
		try {
			await this.dependencies.writer.writeText(text || '[Content unavailable]');
			return { kind: 'degraded', issues: [issue] };
		} catch (error) {
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : 'The clipboard could not be written'
			};
		}
	}
}
