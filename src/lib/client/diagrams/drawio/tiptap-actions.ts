import type { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { SuggestionId } from '$lib/models/suggestions';

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
