import {
	AIHighlight,
	Callout,
	Drawio,
	IFrameExtended,
	ImageExtended,
	Mermaid,
	SlashCommand,
	SvelteNodeViewRenderer,
	useEditor,
	VideoExtended
} from './index.js';
import type { Extensions } from '@tiptap/core';
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
import type {
	DiagramId,
	DiagramSuggestion,
	DrawioDiagram,
	NoteLinkTarget,
	SuggestionId
} from '$lib/models';
import SlashCommandComp from '../SlashCommand.svelte';
import CalloutComp from '../Callout.svelte';
import TableOfContents, { getHierarchicalIndexes } from '@tiptap/extension-table-of-contents';
import { setTocItems } from '../toc.svelte';
import { DiagramDeletion } from './DiagramDeletion.js';
import { InlineSuggestion, type InlineSuggestionRequestInput } from './InlineSuggestion.js';
import {
	armLiteralPaste,
	clipboardImage,
	handleMarkdownPaste,
	isLiteralPasteShortcut
} from './paste.js';
import { stripPastedStyling } from './clipboard-styles.js';
import { NoteLinkMark } from './nodes.js';
import { NoteLinkSuggestion } from './NoteLinkSuggestion.js';
import { HeadingLinkSuggestion, rankHeadingTargets } from './HeadingLinkSuggestion.js';
import { createNoteLinkRenderer } from './note-link-renderer.svelte.js';
import { createHeadingLinkRenderer } from './heading-link-renderer.svelte.js';

const lowlight = createLowlight(all);

export interface EdraEditorProps {
	onUpdate?: () => void;
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
	onConvertMermaid?: (source: string, instruction?: string) => Promise<DiagramSuggestion>;
	getDrawioSuggestion?: (suggestionId: SuggestionId) => DiagramSuggestion | undefined;
	onAcceptDrawio?: (
		suggestionId: SuggestionId,
		source: string,
		renderedSvg: string
	) => Promise<DrawioDiagram>;
	onRejectDrawio?: (suggestionId: SuggestionId) => Promise<void>;
	getDrawioDiagram?: (diagramId: DiagramId) => DrawioDiagram | undefined;
	getNoteId?: () => string;
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
}

export const createEditor = (props?: EdraEditorProps, extraExtensions: Extensions = []) => {
	// Self-referenced only from editor event handlers, which cannot fire during
	// construction — and undefined-safe for SSR, where there is no editor at all.
	const editor = useEditor({
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
				getDrawioSuggestion: props?.getDrawioSuggestion,
				onAcceptDrawio: props?.onAcceptDrawio,
				onRejectDrawio: props?.onRejectDrawio
			}),
			Drawio(DrawioComp).configure({
				getDiagram: props?.getDrawioDiagram,
				getNoteId: props?.getNoteId
			}),
			DiagramDeletion,
			SlashCommand(SlashCommandComp),
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
			TableOfContents.configure({
				getIndex: getHierarchicalIndexes,
				onUpdate: (indexes) => {
					setTocItems(indexes);
				}
			})
		],
		editorProps: {
			attributes: {
				role: 'textbox',
				'aria-label': props?.ariaLabel ?? 'Rich text editor',
				'aria-multiline': 'true'
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
			transformPastedHTML: (html) => stripPastedStyling(html)
		},
		onUpdate: props?.onUpdate || (() => {})
	});
	return editor;
};
