import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/** The range an AI selection action is working on, in ProseMirror positions. */
export interface SelectionActionRange {
	readonly from: number;
	readonly to: number;
}

export const selectionActionKey = new PluginKey<DecorationSet>('selection-action');

/**
 * Hold a wash over the text an AI selection action is working on, for as long as
 * it runs. The caret selection clears as soon as the author clicks anywhere else,
 * so without this the only trace of a multi-second agent turn would be the bubble
 * menu — which the same click dismisses.
 *
 * Set the range with `tr.setMeta(selectionActionKey, { from, to })` and release it
 * with `tr.setMeta(selectionActionKey, null)`. In between the set is mapped through
 * document changes, so it survives the diagram the action inserts beside it.
 */
export function createSelectionActionPlugin(): Plugin {
	return new Plugin<DecorationSet>({
		key: selectionActionKey,
		state: {
			init: () => DecorationSet.empty,
			apply: (tr, previous) => {
				const meta = tr.getMeta(selectionActionKey) as SelectionActionRange | null | undefined;
				if (meta === null) return DecorationSet.empty;
				if (meta) {
					return DecorationSet.create(tr.doc, [
						Decoration.inline(meta.from, meta.to, { class: 'selection-action-range' })
					]);
				}
				return tr.docChanged ? previous.map(tr.mapping, tr.doc) : previous;
			}
		},
		props: {
			decorations(state) {
				return selectionActionKey.getState(state);
			}
		}
	});
}
