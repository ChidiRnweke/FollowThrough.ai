import type { NoteEditorIdentity, NoteWorkspaceEditor } from '$lib/models/browser-workspace';
import type {
	ClipboardSource,
	ClipboardIssue,
	ClipboardTransferReport,
	RichClipboardContent,
	ClipboardReader,
	ClipboardWriter,
	ClipboardDocument,
	ClipboardAppearance,
	ClipboardFeedback
} from '$lib/models/clipboard';
import type { MermaidSvgRenderer, MermaidImageOutput } from '$lib/models/diagrams/mermaid-theme';
import type { MermaidThemeRules } from '$lib/services/diagrams/mermaid-theme';
import type { WorkspaceCapabilityRegistry } from '$lib/stores/workspace/capabilities';

export interface NoteClipboardOperations {
	copy(
		identity: NoteEditorIdentity,
		format: 'markdown' | 'formatted'
	): Promise<ClipboardTransferReport | undefined>;
	copySelection(identity: NoteEditorIdentity): Promise<ClipboardTransferReport | undefined>;
	cut(identity: NoteEditorIdentity): Promise<void>;
	paste(
		identity: NoteEditorIdentity,
		format: 'raw' | 'formatted'
	): Promise<void | { readonly kind: 'failure' }>;
}
export interface NoteClipboardDependencies {
	readonly editors: WorkspaceCapabilityRegistry<NoteWorkspaceEditor>;
	readonly writer: ClipboardWriter;
	readonly reader: ClipboardReader;
	readonly feedback: ClipboardFeedback;
	readonly appearance: ClipboardAppearance;
	readonly themes: MermaidThemeRules;
	readonly renderer: MermaidSvgRenderer;
	readonly output: MermaidImageOutput;
	document(content: RichClipboardContent): ClipboardDocument;
	readImage(source: string): Promise<Blob>;
}
/** Complete clipboard operations over the original mounted editor and raw browser mechanisms. */
export class NoteClipboard implements NoteClipboardOperations {
	constructor(private readonly dependencies: NoteClipboardDependencies) {}
	async copy(
		identity: NoteEditorIdentity,
		format: 'markdown' | 'formatted'
	): Promise<ClipboardTransferReport | undefined> {
		const editor = this.dependencies.editors.get(identity);
		if (!this.active(editor)) return;
		try {
			if (format === 'markdown') {
				const text = editor.port.markdown(editor.state.contextRange);
				if (text === undefined) return;
				if (!text) {
					this.dependencies.feedback.error('The selection could not be copied');
					return { kind: 'failure', message: 'The selection could not be copied' };
				}
				await this.dependencies.writer.writeText(text);
				return { kind: 'complete' };
			}
			const source = editor.port.copySource(editor.state.contextRange);
			if (source) return await this.copyAndReport(source);
		} catch {
			this.dependencies.feedback.error('The clipboard could not be written');
			return { kind: 'failure', message: 'The clipboard could not be written' };
		}
	}
	async copySelection(identity: NoteEditorIdentity): Promise<ClipboardTransferReport | undefined> {
		const editor = this.dependencies.editors.get(identity);
		if (!this.active(editor)) return;
		try {
			const source = editor.port.copySource(undefined);
			if (source) return await this.copyAndReport(source);
		} catch {
			this.dependencies.feedback.error('The clipboard could not be written');
			return { kind: 'failure', message: 'The clipboard could not be written' };
		}
	}
	async cut(identity: NoteEditorIdentity): Promise<void> {
		const editor = this.dependencies.editors.get(identity);
		if (!this.active(editor)) return;
		const selection = editor.port.captureSelection();
		if (!selection) return;
		const report = await this.copyAndReport(selection.source);
		if (report.kind !== 'complete') {
			this.dependencies.feedback.keptSelection(false);
			return;
		}
		if (!this.active(editor)) return;
		if (!editor.port.documentMatches(selection.document)) {
			this.dependencies.feedback.keptSelection(true);
			return;
		}
		editor.port.deleteRange(selection.range);
	}
	async paste(
		identity: NoteEditorIdentity,
		format: 'raw' | 'formatted'
	): Promise<void | { readonly kind: 'failure' }> {
		const editor = this.dependencies.editors.get(identity);
		if (!this.active(editor)) return;
		const range = editor.state.contextRange;
		const generation = editor.state.documentGeneration;
		try {
			const content = await this.dependencies.reader.read(format);
			if (!this.active(editor) || editor.state.documentGeneration !== generation || !content.text)
				return;
			editor.port.paste(content, range);
		} catch {
			this.dependencies.feedback.error('The clipboard could not be read');
			return { kind: 'failure' };
		}
	}
	private active(editor: NoteWorkspaceEditor): boolean {
		return editor.state.active && editor.port.active;
	}
	private async copyAndReport(source: ClipboardSource): Promise<ClipboardTransferReport> {
		try {
			const report = await this.transfer(source);
			this.dependencies.feedback.report(report);
			return report;
		} catch {
			this.dependencies.feedback.error('The clipboard could not be written');
			return { kind: 'failure', message: 'The clipboard could not be written' };
		}
	}
	private async renderDiagram(source: string): Promise<Blob> {
		const appearance = this.dependencies.themes.resolve(this.dependencies.appearance.theme());
		const svg = await this.dependencies.renderer.render(
			`mermaid-export-${crypto.randomUUID()}`,
			source,
			appearance.config,
			'screen'
		);
		const dataUrl = await this.dependencies.output.rasterise(
			svg,
			appearance.background,
			this.dependencies.output.pixelRatio()
		);
		return this.dependencies.output.blob(dataUrl);
	}
	/** Start the native write before awaiting media so the user's activation is retained. */
	private async transfer(source: ClipboardSource): Promise<ClipboardTransferReport> {
		if (source.kind === 'rich') {
			const prepared = this.prepareRich(source);
			try {
				await this.dependencies.writer.writeRich(prepared.then((result) => result.content));
				const { issues } = await prepared;
				const [first, ...rest] = issues;
				return first ? { kind: 'degraded', issues: [first, ...rest] } : { kind: 'complete' };
				// audit-allow: silent-catch — copyTextAfterFailure returns a degraded/failure report; the note clipboard adapter displays the text-only warning or write failure.
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
			// audit-allow: silent-catch — the copied text marks the unavailable image/diagram and the returned degraded/failure report is displayed by the note clipboard adapter.
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
				// audit-allow: silent-catch — markUnavailable inserts a visible placeholder into the copied document; the returned issues produce the note clipboard warning.
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
