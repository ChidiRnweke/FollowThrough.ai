import type { ClipboardSource, ClipboardTransferReport } from '$lib/models/clipboard';
export type ClipboardPaste = { readonly kind: 'html' | 'text'; readonly text: string };
export interface ClipboardReader {
	read(format: 'raw' | 'formatted'): Promise<ClipboardPaste>;
}
export interface ClipboardFeedback {
	report(report: ClipboardTransferReport): void;
	error(message: string): void;
	keptSelection(changed: boolean): void;
}
export interface ClipboardCopy {
	copy(source: ClipboardSource): Promise<ClipboardTransferReport>;
}
export interface ClipboardTextWriter {
	writeText(text: string): Promise<void>;
}
export interface NoteClipboardOperations extends ClipboardCopy {
	copyMarkdown(text: string): Promise<ClipboardTransferReport>;
	cut(source: ClipboardSource): Promise<boolean>;
	cutChanged(): void;
	read(format: 'raw' | 'formatted'): Promise<ClipboardPaste | { readonly kind: 'failure' }>;
}
/** User-facing clipboard operations share one failure policy for keyboard and menu actions. */
export class NoteClipboard implements NoteClipboardOperations {
	constructor(
		private readonly transfer: ClipboardCopy,
		private readonly writer: ClipboardTextWriter,
		private readonly reader: ClipboardReader,
		private readonly feedback: ClipboardFeedback
	) {}
	async copy(source: ClipboardSource): Promise<ClipboardTransferReport> {
		try {
			const report = await this.transfer.copy(source);
			this.feedback.report(report);
			return report;
		} catch {
			this.feedback.error('The clipboard could not be written');
			return { kind: 'failure', message: 'The clipboard could not be written' };
		}
	}
	async copyMarkdown(text: string): Promise<ClipboardTransferReport> {
		if (!text) {
			this.feedback.error('The selection could not be copied');
			return { kind: 'failure', message: 'The selection could not be copied' };
		}
		try {
			await this.writer.writeText(text);
			return { kind: 'complete' };
		} catch {
			this.feedback.error('The clipboard could not be written');
			return { kind: 'failure', message: 'The clipboard could not be written' };
		}
	}
	async cut(source: ClipboardSource): Promise<boolean> {
		const report = await this.copy(source);
		if (report.kind !== 'complete') this.feedback.keptSelection(false);
		return report.kind === 'complete';
	}
	cutChanged(): void {
		this.feedback.keptSelection(true);
	}
	async read(format: 'raw' | 'formatted'): Promise<ClipboardPaste | { readonly kind: 'failure' }> {
		try {
			return await this.reader.read(format);
		} catch {
			this.feedback.error('The clipboard could not be read');
			return { kind: 'failure' };
		}
	}
}

export interface ClipboardAppearance {
	theme(): import('$lib/models/diagrams/mermaid-theme').MermaidTheme;
}
export interface ClipboardDiagramOperations {
	render(source: string): Promise<Blob>;
}
export class ClipboardDiagrams implements ClipboardDiagramOperations {
	constructor(
		private readonly diagrams: Pick<
			import('$lib/controllers/diagrams/mermaid').MermaidController,
			'png'
		>,
		private readonly appearance: ClipboardAppearance
	) {}
	readonly render = (source: string): Promise<Blob> =>
		this.diagrams.png(source, this.appearance.theme());
}
