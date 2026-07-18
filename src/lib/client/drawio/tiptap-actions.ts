import type { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { DiagramId, SuggestionId } from '$lib/models';

export interface DrawioNodeTransactionPort {
	readonly state: EditorState;
	readonly schema: Schema;
	dispatch(transaction: Transaction): void;
}

export const setPendingDrawioSuggestion = (
	port: DrawioNodeTransactionPort,
	node: ProseMirrorNode,
	position: number,
	suggestionId: SuggestionId | null
): void => {
	port.dispatch(
		port.state.tr.setNodeMarkup(position, undefined, {
			...node.attrs,
			pendingDrawioSuggestionId: suggestionId
		})
	);
};

export const insertAcceptedDrawioAfterMermaid = (
	port: DrawioNodeTransactionPort,
	node: ProseMirrorNode,
	position: number,
	diagramId: DiagramId
): void => {
	const drawioType = port.schema.nodes.drawio;
	if (!drawioType) throw new Error('The draw.io node is not registered.');
	const transaction = port.state.tr.setNodeMarkup(position, undefined, {
		...node.attrs,
		pendingDrawioSuggestionId: null
	});
	transaction.insert(position + node.nodeSize, drawioType.create({ diagramId }));
	port.dispatch(transaction);
};
