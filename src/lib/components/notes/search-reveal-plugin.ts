import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/** The range a search click-through landed on, in ProseMirror positions. */
export interface SearchRevealRange {
	readonly from: number;
	readonly to: number;
}

export const searchRevealKey = new PluginKey<DecorationSet>('search-reveal');

/**
 * Light the match a global-search click-through jumped to. A decoration, not a mark,
 * so nothing about the reveal is ever serialized into the document.
 *
 * Set the range with `tr.setMeta(searchRevealKey, { from, to })` and release it with
 * `tr.setMeta(searchRevealKey, null)`. In between the set is mapped through document
 * changes, so the wash tracks the text if the author starts typing. Same mechanics as
 * the selection-action wash.
 */
export function createSearchRevealPlugin(): Plugin {
	return new Plugin<DecorationSet>({
		key: searchRevealKey,
		state: {
			init: () => DecorationSet.empty,
			apply: (tr, previous) => {
				const meta = tr.getMeta(searchRevealKey) as SearchRevealRange | null | undefined;
				if (meta === null) return DecorationSet.empty;
				if (meta) {
					return DecorationSet.create(tr.doc, [
						Decoration.inline(meta.from, meta.to, { class: 'search-reveal' })
					]);
				}
				return tr.docChanged ? previous.map(tr.mapping, tr.doc) : previous;
			}
		},
		props: {
			decorations(state) {
				return searchRevealKey.getState(state);
			}
		}
	});
}
