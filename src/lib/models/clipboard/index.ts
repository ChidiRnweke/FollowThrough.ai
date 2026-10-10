export type ClipboardSource =
	| { readonly kind: 'rich'; readonly html: string; readonly text: string }
	| { readonly kind: 'image' | 'diagram'; readonly source: string; readonly text: string };

export interface ClipboardAsset {
	readonly id: string;
	readonly kind: 'image' | 'diagram';
	readonly source: string;
}

export interface ClipboardIssue {
	readonly kind: 'image' | 'diagram' | 'formatting';
	readonly message: string;
}

export type ClipboardTransferReport =
	| { readonly kind: 'complete' }
	| { readonly kind: 'degraded'; readonly issues: readonly [ClipboardIssue, ...ClipboardIssue[]] }
	| { readonly kind: 'failure'; readonly message: string };

export interface RichClipboardContent {
	readonly html: string;
	readonly text: string;
}

export type ClipboardPaste = { readonly kind: 'html' | 'text'; readonly text: string };
export interface ClipboardReader {
	read(format: 'raw' | 'formatted'): Promise<ClipboardPaste>;
}
export interface ClipboardFeedback {
	report(report: ClipboardTransferReport): void;
	error(message: string): void;
	keptSelection(changed: boolean): void;
}
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
export interface ClipboardAppearance {
	theme(): import('$lib/models/diagrams/mermaid-theme').MermaidTheme;
}
