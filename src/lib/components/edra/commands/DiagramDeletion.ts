import { Extension } from '@tiptap/core';
import type { Command, EditorState, Transaction } from '@tiptap/pm/state';
import { NodeSelection } from '@tiptap/pm/state';

const DIAGRAM_NODE_NAMES = new Set(['mermaid', 'drawio']);

const isDiagram = (node: { readonly type: { readonly name: string } } | null | undefined) =>
	Boolean(node && DIAGRAM_NODE_NAMES.has(node.type.name));

function diagramBeforeCaret(
	state: EditorState
): { readonly from: number; readonly to: number } | undefined {
	const { selection } = state;
	if (!selection.empty) return undefined;

	const { $from } = selection;
	if (isDiagram($from.nodeBefore)) {
		return { from: $from.pos - $from.nodeBefore!.nodeSize, to: $from.pos };
	}

	if ($from.parentOffset !== 0 || $from.depth === 0) return undefined;
	const parentStart = $from.before();
	const nodeBefore = state.doc.resolve(parentStart).nodeBefore;
	if (!isDiagram(nodeBefore)) return undefined;

	return { from: parentStart - nodeBefore!.nodeSize, to: parentStart };
}

export const deleteDiagramBackward = (
	state: EditorState,
	dispatch?: (transaction: Transaction) => void
): boolean => {
	const { selection } = state;
	if (selection instanceof NodeSelection && isDiagram(selection.node)) {
		dispatch?.(state.tr.delete(selection.from, selection.to));
		return true;
	}

	const range = diagramBeforeCaret(state);
	if (!range) return false;
	dispatch?.(state.tr.delete(range.from, range.to));
	return true;
};

export const DiagramDeletion = Extension.create({
	name: 'diagramDeletion',
	priority: 110,
	addKeyboardShortcuts() {
		return {
			Backspace: (): ReturnType<Command> => {
				if (document.activeElement instanceof HTMLTextAreaElement) return false;
				return deleteDiagramBackward(this.editor.state, (transaction) =>
					this.editor.view.dispatch(transaction)
				);
			}
		};
	}
});
