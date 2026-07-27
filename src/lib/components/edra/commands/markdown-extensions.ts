import type { Extensions } from '@tiptap/core';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight } from 'lowlight';
import editorExtensions from './extensions.js';
import {
	AIHighlightNode,
	CalloutNode,
	DrawioNode,
	IFrameNode,
	MermaidNode,
	NoteLinkMark,
	TodoNodeBase
} from './nodes.js';
import { ImageNode } from './ImageExtended.js';
import { VideoNode } from './VideoExtended.js';

/**
 * The note schema, headless.
 *
 * Notes are stored as ProseMirror JSON; Markdown is a conversion layer the agent tools
 * and the importer speak. A node missing from this list is not "rendered plainly" — it
 * is erased, and serializing a note containing one silently replaces the diagram, table
 * or callout with an empty paragraph. So this set must stay equal to what
 * `createEditor` builds, which is why the shared pieces are imported rather than
 * retyped: `extensions.ts` is the same module the editor uses, and the custom nodes come
 * from `nodes.ts`, which the editor's node-view factories extend.
 *
 * The only deliberate omissions are view-layer extensions that contribute no schema
 * (slash command, table of contents, inline suggestions, diagram deletion) and
 * `mediaPlaceholder`, which represents an upload still in flight and has no Markdown
 * form worth preserving.
 */
export const noteMarkdownExtensions: Extensions = [
	...editorExtensions,
	// `extensions.ts` disables StarterKit's code block so the editor can supply a
	// highlighted one; the language registry stays empty here because Markdown output
	// depends only on the `language` attribute, not on tokenization.
	CodeBlockLowlight.configure({ lowlight: createLowlight() }),
	ImageNode,
	VideoNode,
	IFrameNode,
	MermaidNode,
	DrawioNode,
	CalloutNode,
	TodoNodeBase,
	AIHighlightNode,
	NoteLinkMark
];
