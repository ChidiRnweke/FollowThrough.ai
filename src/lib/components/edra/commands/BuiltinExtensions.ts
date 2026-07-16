import {
	Extension,
	Mark,
	mergeAttributes,
	Node,
	type Editor,
	type NodeViewProps
} from '@tiptap/core';
import type { Component } from 'svelte';
import { SvelteNodeViewRenderer } from './SvelteNodeViewRenderer.js';

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		aiHighlight: {
			setAIHighlight: (attributes?: { color?: string }) => ReturnType;
			unsetAIHighlight: () => ReturnType;
		};
		iframe: { setIframe: (attributes: { src: string }) => ReturnType };
		mermaid: { setMermaid: (source: string) => ReturnType };
	}
}

export const AIHighlight = Mark.create({
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

export function addAIHighlight(editor: Editor): void {
	editor.chain().focus().setAIHighlight({ color: 'var(--color-muted)' }).run();
}

export function removeAIHighlight(editor: Editor): void {
	editor.chain().unsetAIHighlight().run();
}

export const IFrameExtended = (component: Component<NodeViewProps>) =>
	Node.create({
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
		addCommands() {
			return {
				setIframe:
					(attributes) =>
					({ commands }) =>
						commands.insertContent({ type: this.name, attrs: attributes })
			};
		},
		addNodeView: () => SvelteNodeViewRenderer(component)
	});

export interface MermaidOptions {
	onRevise?: (
		source: string,
		instruction: string
	) => Promise<{ readonly source: string; readonly title?: string }>;
}

export const Mermaid = (component: Component<NodeViewProps>) =>
	Node.create<MermaidOptions>({
		name: 'mermaid',
		group: 'block',
		content: 'text*',
		code: true,
		defining: true,
		addOptions() {
			return { onRevise: undefined };
		},
		parseHTML() {
			return [{ tag: 'div[data-type="mermaid"]' }];
		},
		renderHTML() {
			return ['div', { 'data-type': this.name }, 0];
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
		},
		addNodeView: () => SvelteNodeViewRenderer(component)
	});

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
