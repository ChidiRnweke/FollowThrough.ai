import type { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model';
import type { EditorState, Transaction } from '@tiptap/pm/state';

export interface DiagramNodeTransactionPort {
	readonly state: EditorState;
	readonly schema: Schema;
	dispatch(transaction: Transaction): void;
}

export const setPendingConversionReference = (
	port: DiagramNodeTransactionPort,
	node: ProseMirrorNode,
	position: number,
	reference: string | null
): void => {
	port.dispatch(
		port.state.tr.setNodeMarkup(position, undefined, {
			...node.attrs,
			pendingDrawioSuggestionId: reference
		})
	);
};

export const completePendingConversion = (
	port: DiagramNodeTransactionPort,
	pendingReference: string,
	diagramReference: string
): boolean => {
	let match: { readonly node: ProseMirrorNode; readonly position: number } | undefined;
	port.state.doc.descendants((node, position) => {
		if (node.type.name !== 'mermaid' || node.attrs.pendingDrawioSuggestionId !== pendingReference)
			return true;
		match = { node, position };
		return false;
	});
	if (!match) return false;
	const drawioType = port.schema.nodes.drawio;
	if (!drawioType) throw new Error('The draw.io node is not registered.');
	const transaction = port.state.tr.setNodeMarkup(match.position, undefined, {
		...match.node.attrs,
		pendingDrawioSuggestionId: null
	});
	transaction.insert(
		match.position + match.node.nodeSize,
		drawioType.create({ diagramId: diagramReference })
	);
	port.dispatch(transaction);
	return true;
};
