export type RenderedMarkdown =
	| { readonly kind: 'rendered'; readonly html: string }
	| { readonly kind: 'failure'; readonly raw: string };

export type ChatMarkdownSegment = { type: 'markdown' | 'diff' | 'mermaid'; content: string };
