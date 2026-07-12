import { mergeAttributes, Node, type NodeViewProps } from '@tiptap/core';
import type { Component } from 'svelte';
import { SvelteNodeViewRenderer } from './SvelteNodeViewRenderer.js';

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		todoNode: {
			insertTodoNode: (attributes: { todoId: string }) => ReturnType;
		};
	}
}

export const TodoNode = (component: Component<NodeViewProps>) =>
	Node.create({
		name: 'todoNode',
		group: 'block',
		atom: true,
		draggable: true,
		selectable: true,

		addAttributes() {
			return {
				todoId: { default: null }
			};
		},

		parseHTML() {
			return [{ tag: 'div[data-type="todo-node"]' }];
		},

		renderHTML({ HTMLAttributes }) {
			return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'todo-node' })];
		},

		addCommands() {
			return {
				insertTodoNode:
					(attributes) =>
					({ commands }) =>
						commands.insertContent({ type: this.name, attrs: attributes })
			};
		},

		addNodeView: () => SvelteNodeViewRenderer(component)
	});
