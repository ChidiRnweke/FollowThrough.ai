import {
	AIHighlight,
	Callout,
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
import SlashCommandComp from '../SlashCommand.svelte';
import CalloutComp from '../Callout.svelte';
import TableOfContents, { getHierarchicalIndexes } from '@tiptap/extension-table-of-contents';
import { setTocItems } from '../toc.svelte';

const lowlight = createLowlight(all);

export interface EdraEditorProps {
	onUpdate?: () => void;
	onFileUpload?: (file: File) => Promise<string>;
	callAI?: (
		prompt: string,
		onChunk: (chunk: string) => void,
		onError: (error: Error) => void
	) => Promise<void>;
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
			Mermaid(MermaidComp),
			SlashCommand(SlashCommandComp),
			Callout(CalloutComp),
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
		onUpdate: props?.onUpdate || (() => {})
	});
