import {
	createAtomBlockMarkdownSpec,
	Mark,
	mergeAttributes,
	Node,
	wrappingInputRule,
	type JSONContent,
	type MarkdownLexerConfiguration,
	type MarkdownParseHelpers,
	type MarkdownParseResult,
	type MarkdownRendererHelpers,
	type MarkdownToken,
	type MarkdownTokenizer
} from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import type { DiagramId, DiagramSuggestion, DrawioDiagram } from '$lib/models/diagrams';
import type { SuggestionId } from '$lib/models/suggestions';

/**
 * Returned by a parse handler that does not claim the token.
 *
 * Handlers registered against the same token name are tried in descending priority
 * until one yields a node, but `MarkdownParseResult` has no member for "declined", so
 * the cast states the runtime contract the type omits.
 */
const declineToken = null as unknown as MarkdownParseResult;

/**
 * Headless definitions for the editor's own nodes and marks.
 *
 * These carry the schema *and* the Markdown handlers, and deliberately contain no
 * Svelte: the server serializes notes through exactly these definitions, so a node
 * defined only in the Svelte layer would be silently erased on every round trip
 * (`before\n\n…\n\nafter` with the diagram gone). `BuiltinExtensions.ts` extends each
 * of these with its node view rather than redeclaring it, so the two cannot drift.
 */

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		aiHighlight: {
			setAIHighlight: (attributes?: { color?: string }) => ReturnType;
			unsetAIHighlight: () => ReturnType;
		};
		iframe: { setIframe: (attributes: { src: string }) => ReturnType };
		mermaid: { setMermaid: (source: string) => ReturnType };
		drawio: { setDrawio: (diagramId: DiagramId) => ReturnType };
		callout: { setCallout: () => ReturnType };
		todoNode: { insertTodoNode: (attributes: { todoId: string }) => ReturnType };
	}
}

export const AIHighlightNode = Mark.create({
	name: 'ai-highlight',
	addAttributes() {
		return { color: { default: 'var(--color-muted)' } };
	},
	parseHTML() {
		return [{ tag: 'span[data-ai-highlight]' }];
	},
	renderHTML({ HTMLAttributes }) {
		return ['span', mergeAttributes(HTMLAttributes, { 'data-ai-highlight': '' }), 0];
	},
	// A transient selection highlight, not authored emphasis: carry the text through
	// unchanged so an AI-assisted edit never leaves markup behind in the Markdown.
	renderMarkdown: (node: JSONContent, helpers: MarkdownRendererHelpers) =>
		helpers.renderChildren(node.content ?? []),
	addCommands() {
		return {
			setAIHighlight:
				(attributes = {}) =>
				({ commands }) =>
					commands.setMark(this.name, attributes),
			unsetAIHighlight:
				() =>
				({ commands }) =>
					commands.unsetMark(this.name)
		};
	}
});

/**
 * A link from one note to another.
 *
 * A mark rather than a node, so the link text stays ordinary editable text and inherits
 * bold and italic the way any other span does. Only the `noteId` is stored: a title cached
 * in the document is a lie the moment the target is renamed, so the label is resolved at
 * render time from the note tree.
 *
 * Serialized as `[text](note:<id>)` — an ordinary Markdown link with a scheme of its own,
 * so it degrades to something readable anywhere Markdown is read, and the importer can
 * recognise it on the way back in.
 */
export interface NoteLinkOptions {
	/**
	 * Follow a link. Returns whether it handled the click, so a host that cannot navigate
	 * leaves the event alone rather than swallowing it into a dead end.
	 */
	onOpen?: (noteId: string, options: { readonly background: boolean }) => boolean;
}

export const NoteLinkMark = Mark.create<NoteLinkOptions>({
	name: 'noteLink',
	// Above StarterKit's `link` (1000), which claims the same token and would otherwise
	// swallow a note link as an ordinary external one.
	priority: 1100,
	inclusive: false,
	addOptions() {
		return { onOpen: undefined };
	},
	/**
	 * StarterKit configures `link` with `openOnClick: false`, so a note link has to supply
	 * its own. Handled here rather than by an `<a href>` navigation so the target lands in
	 * the workbench instead of reloading the shell; ctrl/⌘-click opens it behind the
	 * current pane, matching the tree and the tab strip.
	 */
	addProseMirrorPlugins() {
		const onOpen = this.options.onOpen;
		if (!onOpen) return [];
		return [
			new Plugin({
				props: {
					handleClick: (_view, _pos, event) => {
						const target = event.target;
						if (!(target instanceof Element)) return false;
						const noteId = target.closest('a[data-note-id]')?.getAttribute('data-note-id');
						if (!noteId) return false;
						if (!onOpen(noteId, { background: event.metaKey || event.ctrlKey })) return false;
						event.preventDefault();
						return true;
					}
				}
			})
		];
	},
	addAttributes() {
		return {
			noteId: {
				default: null,
				parseHTML: (element) => element.getAttribute('data-note-id'),
				renderHTML: (attributes) =>
					attributes.noteId ? { 'data-note-id': attributes.noteId as string } : {}
			}
		};
	},
	parseHTML() {
		return [{ tag: 'a[data-note-id]' }];
	},
	renderHTML({ HTMLAttributes }) {
		return [
			'a',
			mergeAttributes(HTMLAttributes, {
				href: HTMLAttributes['data-note-id'] ? `/notes/${HTMLAttributes['data-note-id']}` : '#',
				class: 'note-link'
			}),
			0
		];
	},
	markdownTokenName: 'link',
	/**
	 * Owns the `link` token outright, producing an ordinary `link` mark for anything that is
	 * not a note reference.
	 *
	 * Declining is not an option here: unlike a node handler, a mark handler that returns
	 * nothing does not fall through to the next candidate — the token is consumed and its
	 * text is dropped, which turned every external link in a note into an empty paragraph.
	 * Since this handler has to read the href to tell the two apart, it returns both.
	 */
	parseMarkdown: (token: MarkdownToken, helpers: MarkdownParseHelpers): MarkdownParseResult => {
		const href = typeof token.href === 'string' ? token.href : '';
		const children = helpers.parseInline((token.tokens ?? []) as MarkdownToken[]);
		if (href.startsWith('note:'))
			return helpers.applyMark('noteLink', children, { noteId: href.slice('note:'.length) });
		return helpers.applyMark('link', children, {
			href,
			...(typeof token.title === 'string' && token.title ? { title: token.title } : {})
		});
	},
	renderMarkdown: (node: JSONContent, helpers: MarkdownRendererHelpers) => {
		const noteId = node.attrs?.noteId as string | undefined;
		const text = helpers.renderChildren(node.content ?? []);
		return noteId ? `[${text}](note:${noteId})` : text;
	}
});

export const IFrameNode = Node.create({
	name: 'iframe',
	group: 'block',
	atom: true,
	draggable: true,
	addAttributes() {
		return { src: { default: '' }, width: { default: '100%' }, height: { default: 360 } };
	},
	parseHTML() {
		return [{ tag: 'iframe' }];
	},
	renderHTML({ HTMLAttributes }) {
		return ['iframe', HTMLAttributes];
	},
	...createAtomBlockMarkdownSpec({ nodeName: 'iframe', allowedAttributes: ['src'] }),
	addCommands() {
		return {
			setIframe:
				(attributes) =>
				({ commands }) =>
					commands.insertContent({ type: this.name, attrs: attributes })
		};
	}
});

export interface MermaidOptions {
	onRevise?: (
		source: string,
		instruction: string
	) => Promise<{ readonly source: string; readonly title?: string }>;
	onConvert?: (source: string, instruction?: string) => Promise<DiagramSuggestion>;
	getDrawioSuggestion?: (suggestionId: SuggestionId) => DiagramSuggestion | undefined;
	onAcceptDrawio?: (
		suggestionId: SuggestionId,
		source: string,
		renderedSvg: string
	) => Promise<DrawioDiagram>;
	onRejectDrawio?: (suggestionId: SuggestionId) => Promise<void>;
}

export const MermaidNode = Node.create<MermaidOptions>({
	name: 'mermaid',
	group: 'block',
	atom: true,
	content: 'text*',
	code: true,
	defining: true,
	// Beat StarterKit's `codeBlock`, which claims the same `code` token. Handlers are
	// tried in descending priority, so anything at or below 100 never sees the fence.
	priority: 200,
	addOptions() {
		return {
			onRevise: undefined,
			onConvert: undefined,
			getDrawioSuggestion: undefined,
			onAcceptDrawio: undefined,
			onRejectDrawio: undefined
		};
	},
	addAttributes() {
		return {
			width: {
				default: '100%',
				parseHTML: (element) => element.getAttribute('data-width') ?? '100%',
				renderHTML: (attributes) => ({ 'data-width': attributes.width as string })
			},
			pendingDrawioSuggestionId: {
				default: null,
				parseHTML: (element) => element.getAttribute('data-pending-drawio-suggestion-id'),
				renderHTML: (attributes) =>
					attributes.pendingDrawioSuggestionId
						? {
								'data-pending-drawio-suggestion-id': attributes.pendingDrawioSuggestionId as string
							}
						: {}
			}
		};
	},
	parseHTML() {
		return [{ tag: 'div[data-type="mermaid"]' }];
	},
	renderHTML({ HTMLAttributes }) {
		return ['div', mergeAttributes(HTMLAttributes, { 'data-type': this.name }), 0];
	},
	// A ```mermaid fence rather than the Pandoc atom syntax the other diagram nodes use:
	// it is what authors and models already write, and the source is the node's text
	// content, not an attribute.
	markdownTokenName: 'code',
	parseMarkdown: (token: MarkdownToken, helpers: MarkdownParseHelpers): MarkdownParseResult => {
		if (token.lang !== 'mermaid') return declineToken;
		const source = typeof token.text === 'string' ? token.text : '';
		return helpers.createNode(
			'mermaid',
			{ width: '100%' },
			source ? [helpers.createTextNode(source)] : []
		);
	},
	// No trailing blank line: the serializer already separates blocks, and the extra
	// newline parses back as an empty paragraph that accumulates on every round trip.
	renderMarkdown: (node: JSONContent) => {
		const source = (node.content ?? []).map((child) => child.text ?? '').join('');
		return `\`\`\`mermaid\n${source}\n\`\`\``;
	},
	addCommands() {
		return {
			setMermaid:
				(source) =>
				({ commands }) =>
					commands.insertContent({
						type: this.name,
						content: source ? [{ type: 'text', text: source }] : []
					})
		};
	}
});

export interface DrawioOptions {
	getDiagram?: (diagramId: DiagramId) => DrawioDiagram | undefined;
	getNoteId?: () => string;
}

export const DrawioNode = Node.create<DrawioOptions>({
	name: 'drawio',
	group: 'block',
	atom: true,
	draggable: true,
	addOptions() {
		return { getDiagram: undefined, getNoteId: undefined };
	},
	addAttributes() {
		return { diagramId: { default: null } };
	},
	parseHTML() {
		return [{ tag: 'div[data-type="drawio"]' }];
	},
	renderHTML({ HTMLAttributes }) {
		return ['div', mergeAttributes(HTMLAttributes, { 'data-type': this.name })];
	},
	// The diagram itself lives in its own table; Markdown only has to carry the reference.
	...createAtomBlockMarkdownSpec({ nodeName: 'drawio', allowedAttributes: ['diagramId'] }),
	addCommands() {
		return {
			setDrawio:
				(diagramId) =>
				({ commands }) =>
					commands.insertContent({ type: this.name, attrs: { diagramId } })
		};
	}
});

export const TodoNodeBase = Node.create({
	name: 'todoNode',
	group: 'block',
	atom: true,
	draggable: true,
	selectable: true,
	addAttributes() {
		return { todoId: { default: null } };
	},
	parseHTML() {
		return [{ tag: 'div[data-type="todo-node"]' }];
	},
	renderHTML({ HTMLAttributes }) {
		return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'todo-node' })];
	},
	...createAtomBlockMarkdownSpec({ nodeName: 'todoNode', allowedAttributes: ['todoId'] }),
	addCommands() {
		return {
			insertTodoNode:
				(attributes) =>
				({ commands }) =>
					commands.insertContent({ type: this.name, attrs: attributes })
		};
	}
});

export const CalloutNode = Node.create({
	name: 'callout',
	content: 'paragraph+',
	group: 'block',
	defining: true,
	selectable: true,
	draggable: true,

	addAttributes() {
		return { emoji: { default: '💡' } };
	},

	markdownTokenizer: {
		name: 'callout',
		level: 'block',
		// The whole delimiter, not just its first character: marked cuts the block at
		// whatever `start` reports, so a bare `$` split every paragraph containing a price
		// into fragments and handed mid-sentence `$$…$$` to the block math tokenizer.
		start: (src: string) => src.indexOf('$callout'),
		tokenize: (
			src: string,
			_tokens: MarkdownToken[],
			lexer: MarkdownLexerConfiguration
		): MarkdownToken | undefined => {
			// Match $callout[emoji]\ncontent\n$
			const match = /^\$callout\s*(.*)?\n([\s\S]*?)\n\$/.exec(src);
			if (!match) return undefined;
			return {
				type: 'callout',
				raw: match[0],
				emoji: match[1]?.trim() || '💡',
				text: match[2],
				tokens: lexer.blockTokens(match[2])
			};
		}
	} satisfies MarkdownTokenizer,

	parseMarkdown: (token: MarkdownToken, helpers: MarkdownParseHelpers) => ({
		type: 'callout',
		attrs: { emoji: token.emoji },
		content: helpers.parseChildren((token.tokens ?? []) as MarkdownToken[])
	}),

	renderMarkdown: (node: JSONContent, helpers: MarkdownRendererHelpers) => {
		const content = helpers.renderChildren(node);
		const emoji = (node.attrs?.emoji as string) || '💡';
		return `$callout${emoji}\n${content}\n$`;
	},

	addOptions() {
		return { HTMLAttributes: { class: 'callout' } };
	},

	parseHTML() {
		return [{ tag: 'div[class=callout]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return ['div', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
	},

	addCommands() {
		return {
			setCallout:
				() =>
				({ commands, editor }) => {
					const { type = null } = editor.getAttributes(this.name);
					return type ? commands.lift(this.name) : commands.toggleWrap(this.name);
				}
		};
	},

	addInputRules() {
		return [
			wrappingInputRule({
				find: /^\$callout\s*(.*)?\s$/,
				type: this.type,
				getAttributes: (match) => ({ emoji: match[1]?.trim() || '💡' })
			})
		];
	}
});
