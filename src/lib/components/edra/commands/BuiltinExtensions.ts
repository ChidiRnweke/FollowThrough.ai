import { Extension, type Editor, type NodeViewProps } from '@tiptap/core';
import type { Component } from 'svelte';
import { SvelteNodeViewRenderer } from './SvelteNodeViewRenderer.js';
import { CalloutNode, DrawioNode, IFrameNode, MermaidNode, TodoNodeBase } from './nodes.js';

/**
 * Editor-side wiring for the nodes declared in `nodes.ts`.
 *
 * Each factory only attaches a Svelte node view; the schema, attributes, commands and
 * Markdown handlers live in `nodes.ts` so the server can serialize a note through the
 * same definitions. Redeclaring a node here would reintroduce the drift that silently
 * dropped diagrams from serialized notes.
 */

export {
	AIHighlightNode as AIHighlight,
	type MermaidOptions,
	type DrawioOptions
} from './nodes.js';

export function addAIHighlight(editor: Editor): void {
	editor.chain().focus().setAIHighlight({ color: 'var(--color-muted)' }).run();
}

export function removeAIHighlight(editor: Editor): void {
	editor.chain().unsetAIHighlight().run();
}

const withNodeView = <T extends { extend: (config: object) => T }>(
	node: T,
	component: Component<NodeViewProps>
): T => node.extend({ addNodeView: () => SvelteNodeViewRenderer(component) });

export const IFrameExtended = (component: Component<NodeViewProps>) =>
	withNodeView(IFrameNode, component);

export const Mermaid = (component: Component<NodeViewProps>) =>
	withNodeView(MermaidNode, component);

export const Drawio = (component: Component<NodeViewProps>) => withNodeView(DrawioNode, component);

export const Callout = (component: Component<NodeViewProps>) =>
	withNodeView(CalloutNode, component);

export const TodoNode = (component: Component<NodeViewProps>) =>
	withNodeView(TodoNodeBase, component);

export const SlashCommand = (component: Component<never>) => {
	void component;
	return Extension.create({ name: 'slashCommand' });
};

export enum AIState {
	Idle = 'idle',
	Confirmation = 'confirmation'
}

export const CONTINUE_WRITING_PROMPT = (text: string) => `Continue writing from:\n\n${text}`;
export const FIX_GRAMMAR_PROMPT = (text: string) => `Fix the grammar:\n\n${text}`;
export const IMPROVE_WRITING_PROMPT = (text: string) => `Improve the writing:\n\n${text}`;
export const MAKE_LONGER_PROMPT = (text: string) => `Make this longer:\n\n${text}`;
export const MAKE_SHORTER_PROMPT = (text: string) => `Make this shorter:\n\n${text}`;
export const SIMPLIFY_LANGUAGE_PROMPT = (text: string) => `Simplify the language:\n\n${text}`;
export const SOLVE_PROBLEM_PROMPT = (text: string) => `Solve this problem:\n\n${text}`;
export const SUMMARIZE_PROMPT = (text: string) => `Summarize:\n\n${text}`;
