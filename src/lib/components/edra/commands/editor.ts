import {
	AIHighlight,
	Callout,
	Drawio,
	IFrameExtended,
	ImageExtended,
	Mermaid,
	SlashCommand,
	ProjectDiagramPicker,
	SvelteNodeViewRenderer,
	useEditor,
	VideoExtended
} from './index.js';
import type { Extensions } from '@tiptap/core';
import type { Editor as AppEditor } from './CoreEditor.js';
import { all, createLowlight } from 'lowlight';
import extensions from './extensions.js';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import CodeBlock from '../CodeBlock.svelte';
import { MediaPlaceholder } from './MediaPlaceHolder.js';
import MediaPlaceholderComp from '../MediaPlaceHolder.svelte';
import ImageExtendedComp from '../ImageExtended.svelte';
import VideoExtendedComp from '../VideoExtended.svelte';
import IFrameComp from '../IFrame.svelte';
import MermaidComp from '../Mermaid.svelte';
import DrawioComp from '../Drawio.svelte';
import type { Component } from 'svelte';
import type { DrawioPreviewProps, DrawioReferenceView } from './nodes.js';
import type { NoteLinkTarget } from './NoteLinkSuggestion.js';
import CalloutComp from '../Callout.svelte';
import TableOfContents, {
	getHierarchicalIndexes,
	type TableOfContentData
} from '@tiptap/extension-table-of-contents';
import { DiagramDeletion } from './DiagramDeletion.js';
import { InlineSuggestion, type InlineSuggestionRequestInput } from './InlineSuggestion.js';
import { Proofread, type ProofreadIssueReport } from './Proofread.js';
import {
	armLiteralPaste,
	clipboardImage,
	handleMarkdownPaste,
	isLiteralPasteShortcut
} from './paste.js';
import { stripPastedStyling } from './clipboard-styles.js';
import { withoutClipboardPadding } from './paste-slice.js';
import { NoteLinkMark } from './nodes.js';
import { NoteLinkSuggestion } from './NoteLinkSuggestion.js';
import { HeadingLinkSuggestion, rankHeadingTargets } from './HeadingLinkSuggestion.js';
import { createNoteLinkRenderer } from './note-link-renderer.svelte.js';
import { createSlashCommandRenderer } from './slash-command-renderer.svelte.js';
import { createHeadingLinkRenderer } from './heading-link-renderer.svelte.js';
import { hasMedia, selectionMedia } from './diagram-copy.js';
import { selectionClipboardItem, selectionPlainText } from './clipboard-payload.js';

const lowlight = createLowlight(all);

export interface EdraEditorProps {
	onUpdate?: () => void;
	/** Read-only instances render the document with every node view but accept no edits. */
	editable?: boolean;
	ariaLabel?: string;
	onFileUpload?: (file: File) => Promise<string>;
	callAI?: (
		prompt: string,
		onChunk: (chunk: string) => void,
		onError: (error: Error) => void
	) => Promise<void>;
	onReviseMermaid?: (
		source: string,
		instruction: string
	) => Promise<{ readonly source: string; readonly title?: string }>;
	onConvertMermaid?: (source: string, instruction?: string) => Promise<string>;
	/** Stops a diagram revision or conversion the user started from a mermaid node. */
	onCancelMermaid?: (kind: 'revise' | 'convert') => void;
	onReviewDrawio?: (reference: string) => void;
	onDismissDrawio?: (reference: string) => Promise<void>;
	getDrawioDiagram?: (reference: string) => DrawioReferenceView | undefined;
	resolveDrawioHref?: (reference: string) => string | undefined;
	drawioPreview?: Component<DrawioPreviewProps>;
	/**
	 * Opens the project-diagram picker. The editor raises the request; the app
	 * presents the list and inserts the reference the user chooses.
	 */
	onPickProjectDiagram?: (editor: AppEditor) => void;
	/**
	 * Proactive ghost text at the caret. Injected so the editor stays unaware of
	 * transports; omitting it disables inline suggestions entirely.
	 */
	getInlineSuggestion?: (
		input: InlineSuggestionRequestInput,
		signal: AbortSignal
	) => Promise<{ readonly text: string }>;
	/**
	 * Notes offered when the author types `@`. Injected, like every other capability
	 * here, so the editor never reaches for a store or a transport of its own. Omitting
	 * it disables note linking.
	 */
	findLinkableNotes?: (query: string) => readonly NoteLinkTarget[];
	/** Follow a note link. Omitting it leaves links inert rather than navigating badly. */
	onOpenNoteLink?: (noteId: string, options: { readonly background: boolean }) => boolean;
	/**
	 * The note's headings, in document order, whenever the structure changes.
	 *
	 * Raw extension data: shaping it into a product model happens above this
	 * boundary, and structure is all that is on offer here anyway — which heading
	 * is *active* depends on the scrollport and the sticky note header, neither of
	 * which the editor is in a position to judge.
	 */
	onTocUpdate?: (headings: TableOfContentData) => void;
	/**
	 * Check a block of prose for spelling and grammar. Injected like everything
	 * else here — the editor never learns which checker is behind it. Omitting it
	 * leaves the browser's own spellchecker in charge.
	 */
	proofread?: (text: string) => Promise<readonly ProofreadIssueReport[]>;
	/**
	 * Whether proofreading starts on. Defaults to on where a checker is supplied;
	 * toggled afterwards with `setProofreadEnabled`.
	 */
	proofreadEnabled?: boolean;
}

export const createEditor = (props?: EdraEditorProps, extraExtensions: Extensions = []) => {
	// Self-referenced only from editor event handlers, which cannot fire during
	// construction — and undefined-safe for SSR, where there is no editor at all.
	const editor = useEditor({
		editable: props?.editable ?? true,
		extensions: [
			...extensions,
			...extraExtensions,
			CodeBlockLowlight.configure({
				lowlight
			}).extend({
				addNodeView() {
					return SvelteNodeViewRenderer(CodeBlock);
				}
			}),
			MediaPlaceholder(MediaPlaceholderComp).configure({
				onUpload: props?.onFileUpload
			}),
			ImageExtended(ImageExtendedComp),
			VideoExtended(VideoExtendedComp),
			IFrameExtended(IFrameComp),
			Mermaid(MermaidComp).configure({
				onRevise: props?.onReviseMermaid,
				onConvert: props?.onConvertMermaid,
				onCancel: props?.onCancelMermaid,
				onReview: props?.onReviewDrawio,
				onDismiss: props?.onDismissDrawio
			}),
			Drawio(DrawioComp).configure({
				getDiagram: props?.getDrawioDiagram,
				resolveHref: props?.resolveDrawioHref,
				preview: props?.drawioPreview
			}),
			DiagramDeletion,
			SlashCommand.configure({ renderer: createSlashCommandRenderer }),
			ProjectDiagramPicker.configure({
				...(props?.onPickProjectDiagram ? { open: props.onPickProjectDiagram } : {})
			}),
			Callout(CalloutComp),
			// Registered on both sides of the wire. The server can already parse and serialize
			// a note link, so an editor that did not know the mark would drop it from the
			// document the moment such a note was opened.
			NoteLinkMark.configure({ onOpen: props?.onOpenNoteLink }),
			NoteLinkSuggestion.configure({
				...(props?.findLinkableNotes ? { findNotes: props.findLinkableNotes } : {}),
				renderer: createNoteLinkRenderer
			}),
			HeadingLinkSuggestion.configure({
				// Read through the closure: `createEditor` runs once, but the table of
				// contents changes with every edit.
				findHeadings: (query) =>
					rankHeadingTargets(
						(editor?.storage.tableOfContents?.content ?? []).map(({ id, level, textContent }) => ({
							id,
							level,
							textContent
						})),
						query
					),
				renderer: createHeadingLinkRenderer
			}),
			InlineSuggestion.configure({
				...(props?.getInlineSuggestion ? { fetchSuggestion: props.getInlineSuggestion } : {}),
				idleDelayMs: 400
			}),
			AIHighlight.configure({
				callAI: props?.callAI || null
			}),
			Proofread.configure({
				...(props?.proofread ? { check: props.proofread } : {}),
				enabled: (props?.proofreadEnabled ?? true) && props?.proofread !== undefined
			}),
			TableOfContents.configure({
				getIndex: getHierarchicalIndexes,
				// Deliberately off, and an explicit key rather than an omission: TipTap's
				// `configure` merges by `Object.keys`, so leaving it out would keep the
				// extension's `() => window` default.
				//
				// Its scroll tracking cannot be made correct here by configuration. The
				// listener is bound once in `onCreate`, while `editor.view.dom` is still
				// detached, so even a lazy resolver returns null and it lands on `window`
				// anyway. And its test is `scrollPosition >= domElement.offsetTop`, where
				// `offsetTop` is measured from the absolutely positioned workspace pane
				// layer rather than the scrollport, and knows nothing of the sticky note
				// header. `NoteEditor` measures the active heading against both instead.
				scrollParent: undefined,
				onUpdate: (indexes) => {
					props?.onTocUpdate?.(indexes);
				}
			})
		],
		editorProps: {
			attributes: {
				role: 'textbox',
				'aria-label': props?.ariaLabel ?? 'Rich text editor',
				'aria-multiline': 'true',
				// Stated rather than inherited: the native checker guesses the language
				// from the surrounding document, and the app shell is the only thing
				// that has ever declared one. Whether that checker runs at all is the
				// Proofread extension's call — it owns the `spellcheck` attribute.
				lang: 'en'
			},
			handleKeyDown: (_view, event) => {
				// Arm rather than paste: the clipboard is only readable from the paste event
				// that follows this keystroke.
				if (isLiteralPasteShortcut(event)) armLiteralPaste();
				return false;
			},
			handlePaste: (view, event) => {
				// A pasted image (screenshot) goes through the attachment upload flow;
				// `uploadMedia` inserts it at the caret once the upload resolves.
				const image = clipboardImage(event);
				if (image && props?.onFileUpload) {
					event.preventDefault();
					queueMicrotask(() => editor?.commands.uploadMedia(image));
					return true;
				}
				return handleMarkdownPaste(view, event);
			},
			// Colours from the source document, not from this note: see clipboard-styles.
			transformPastedHTML: (html) => stripPastedStyling(html),
			// Blank lines the clipboard padded the selection with, not lines the author
			// wrote: see paste-slice. Last hook of every paste path, so it covers the
			// rich-HTML pastes `handleMarkdownPaste` deliberately hands to ProseMirror.
			transformPasted: (slice) => withoutClipboardPadding(slice),
			// The same pass on the way out, so a selection taken from a note that already
			// carries the padding copies clean — into this editor and into anything else.
			transformCopied: (slice) => withoutClipboardPadding(slice),
			handleDOMEvents: {
				// Pictures stay pictures on the way out. A diagram is stored as mermaid source
				// and an image as a relative, cookie-authenticated attachment URL, so the
				// default serialization pastes code and broken links into anything outside
				// this app.
				copy: (view, event) => {
					if (typeof ClipboardItem === 'undefined') return false;
					const media = selectionMedia(view.state);
					if (!hasMedia(media)) return false;
					event.preventDefault();

					// Reached synchronously, while the keystroke's activation is still live: the
					// pictures are still being rendered inside the item. See `selectionClipboardItem`.
					void navigator.clipboard.write([selectionClipboardItem(view.state)]).catch(() => {
						// Whatever went wrong, the selection's text still belongs on the clipboard.
						const fallback = media.lone?.kind === 'mermaid' ? media.lone.source : undefined;
						void navigator.clipboard
							.writeText(fallback ?? selectionPlainText(view.state))
							.catch((error) => console.error('Clipboard text fallback failed', error));
					});
					return true;
				}
			}
		},
		onUpdate: props?.onUpdate || (() => {})
	});
	return editor;
};
