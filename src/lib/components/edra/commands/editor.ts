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
import type { DiagramId, DiagramSuggestion, DrawioDiagram, SuggestionId } from '$lib/models';
import SlashCommandComp from '../SlashCommand.svelte';
import CalloutComp from '../Callout.svelte';
import TableOfContents, { getHierarchicalIndexes } from '@tiptap/extension-table-of-contents';
import { setTocItems } from '../toc.svelte';
import { DiagramDeletion } from './DiagramDeletion.js';
import { InlineSuggestion, type InlineSuggestionRequestInput } from './InlineSuggestion.js';

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
	warmInlineContext?: (input: InlineSuggestionRequestInput, signal: AbortSignal) => Promise<void>;
}

export const createEditor = (props?: EdraEditorProps, extraExtensions: Extensions = []) =>
	useEditor({
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
			InlineSuggestion.configure({
				...(props?.getInlineSuggestion ? { fetchSuggestion: props.getInlineSuggestion } : {}),
				...(props?.warmInlineContext ? { warmContext: props.warmInlineContext } : {}),
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
			}
		},
		onUpdate: props?.onUpdate || (() => {})
	});
