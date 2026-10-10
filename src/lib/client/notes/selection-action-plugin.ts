import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/** The range a wash is held over, in ProseMirror positions. */
export interface SelectionActionRange {
	readonly from: number;
	readonly to: number;
	/**
	 * What the wash is saying. `running` (the default) is an AI action working on the
	 * passage; `held` is the author's own selection, kept visible while the editor is not
	 * the focused thing — the chat is, and the passage is attached to what they are typing.
	 */
	readonly variant?: 'running' | 'held';
}

export const selectionActionKey = new PluginKey<DecorationSet>('selection-action');

/**
 * Hold a wash over a passage the author cannot otherwise see is still spoken for. The
 * caret selection clears as soon as they click anywhere else, so without this the only
 * trace of a multi-second agent turn would be the bubble menu — which the same click
 * dismisses — and a passage attached to the chat would look detached the moment they
 * reached for the composer.
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
						Decoration.inline(meta.from, meta.to, {
							class: meta.variant === 'held' ? 'selection-held' : 'selection-action-range'
						})
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
