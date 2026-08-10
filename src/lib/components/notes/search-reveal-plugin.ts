import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/** The range a search click-through landed on, in ProseMirror positions. */
export interface SearchRevealRange {
	readonly from: number;
	readonly to: number;
}

/**
 * The clicked match plus every other match in the note, so a click-through lights all
 * of them while only the primary is selected and scrolled to.
 */
export interface SearchRevealRanges {
	readonly primary: SearchRevealRange;
	readonly others: readonly SearchRevealRange[];
}

export const searchRevealKey = new PluginKey<DecorationSet>('search-reveal');

/**
 * Light the matches a global-search click-through jumped to. A decoration, not a mark,
 * so nothing about the reveal is ever serialized into the document.
 *
 * Set the ranges with `tr.setMeta(searchRevealKey, { primary, others })` and release them
 * with `tr.setMeta(searchRevealKey, null)`. In between the set is mapped through document
 * changes, so the wash tracks the text if the author starts typing. Same mechanics as
 * the selection-action wash.
 */
export function createSearchRevealPlugin(): Plugin {
	return new Plugin<DecorationSet>({
		key: searchRevealKey,
		state: {
			init: () => DecorationSet.empty,
			apply: (tr, previous) => {
				const meta = tr.getMeta(searchRevealKey) as SearchRevealRanges | null | undefined;
				if (meta === null) return DecorationSet.empty;
				if (meta) {
					return DecorationSet.create(
						tr.doc,
						[meta.primary, ...meta.others].map((range) =>
							Decoration.inline(range.from, range.to, { class: 'search-reveal' })
						)
					);
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
