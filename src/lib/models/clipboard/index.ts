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
