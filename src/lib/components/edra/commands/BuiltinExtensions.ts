import { Extension, type Editor, type NodeViewProps } from '@tiptap/core';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import type { EdraCommand } from './commands.js';
import type { Editor as AppEditor } from './CoreEditor.js';
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

/**
 * The hook the "Project diagram" command calls.
 *
 * The editor knows nothing about projects or transport, so it cannot present a
 * picker; it only raises the request. The note workspace supplies the handler and
 * answers by inserting a reference, which keeps the editor's dependencies pointing
 * the same way every other injected callback does.
 */
export interface ProjectDiagramPickerStorage {
	open?: (editor: AppEditor) => void;
}

declare module '@tiptap/core' {
	interface Storage {
		projectDiagramPicker: ProjectDiagramPickerStorage;
	}
}

export const ProjectDiagramPicker = Extension.create<{ open?: (editor: AppEditor) => void }>({
	name: 'projectDiagramPicker',
	addOptions() {
		return { open: undefined };
	},
	addStorage(): ProjectDiagramPickerStorage {
		return { open: undefined };
	},
	onBeforeCreate() {
		this.storage.open = this.options.open;
	}
});

export const slashCommandKey = new PluginKey('slashCommand');

export interface SlashCommandOptions {
	/** Mounts the list and returns the handlers the plugin drives. */
	renderer?: () => ReturnType<NonNullable<SuggestionOptions['render']>>;
}

/**
 * `/` to insert a block.
 *
 * Only at a word start, so a slash inside prose — a date, a path, "and/or" — is
 * left alone. The query allows no spaces: the menu is meant to close as soon as
 * the writer carries on writing rather than following them across a sentence.
 */
export const SlashCommand = Extension.create<SlashCommandOptions>({
	name: 'slashCommand',

	addOptions() {
		return { renderer: undefined };
	},

	addProseMirrorPlugins() {
		const renderer = this.options.renderer;
		if (!renderer) return [];
		return [
			Suggestion<EdraCommand, EdraCommand>({
				editor: this.editor,
				pluginKey: slashCommandKey,
				char: '/',
				allowedPrefixes: [' ', '\n'],
				allowSpaces: false,
				startOfLine: false,
				items: () => [],
				render: renderer,
				command: ({ editor, range, props }) => {
					// Take the typed `/query` out first: the command that follows inserts at
					// the caret, and leaving the text behind would strand it above the block.
					editor.chain().focus().deleteRange(range).run();
					// The commands are typed against the app's `Editor`, which is TipTap's
					// plus the per-note store slot; the plugin hands back the base one. It is
					// the same instance — the editor the app constructed — so this narrows
					// rather than converts.
					props.onClick?.(editor as unknown as AppEditor);
				}
			})
		];
	}
});

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
