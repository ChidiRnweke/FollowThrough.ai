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
import type { DiagramId, DiagramSuggestion, DrawioDiagram, SuggestionId } from '$lib/models';

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		aiHighlight: {
			setAIHighlight: (attributes?: { color?: string }) => ReturnType;
			unsetAIHighlight: () => ReturnType;
		};
		iframe: { setIframe: (attributes: { src: string }) => ReturnType };
		mermaid: { setMermaid: (source: string) => ReturnType };
		drawio: { setDrawio: (diagramId: DiagramId) => ReturnType };
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
	onConvert?: (source: string, instruction?: string) => Promise<DiagramSuggestion>;
	getDrawioSuggestion?: (suggestionId: SuggestionId) => DiagramSuggestion | undefined;
	onAcceptDrawio?: (
		suggestionId: SuggestionId,
		source: string,
		renderedSvg: string
	) => Promise<DrawioDiagram>;
	onRejectDrawio?: (suggestionId: SuggestionId) => Promise<void>;
}

export const Mermaid = (component: Component<NodeViewProps>) =>
	Node.create<MermaidOptions>({
		name: 'mermaid',
		group: 'block',
		atom: true,
		content: 'text*',
		code: true,
		defining: true,
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
				pendingDrawioSuggestionId: {
					default: null,
					parseHTML: (element) => element.getAttribute('data-pending-drawio-suggestion-id'),
					renderHTML: (attributes) =>
						attributes.pendingDrawioSuggestionId
							? {
									'data-pending-drawio-suggestion-id':
										attributes.pendingDrawioSuggestionId as string
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

export interface DrawioOptions {
	getDiagram?: (diagramId: DiagramId) => DrawioDiagram | undefined;
	getNoteId?: () => string;
}

export const Drawio = (component: Component<NodeViewProps>) =>
	Node.create<DrawioOptions>({
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
		addCommands() {
			return {
				setDrawio:
					(diagramId) =>
					({ commands }) =>
						commands.insertContent({ type: this.name, attrs: { diagramId } })
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
