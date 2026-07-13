import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { SuggestionId, SuggestionKind } from '$lib/models';

export interface AnchoredSuggestion {
	readonly id: SuggestionId;
	readonly kind: SuggestionKind;
	readonly quote: string;
}

/** DOM handle for a rendered inline suggestion widget. */
export interface RenderedWidget {
	readonly dom: HTMLElement;
	destroy: () => void;
}

export const suggestionAnchorKey = new PluginKey<DecorationSet>('suggestion-anchors');
/** Transaction meta value asking the plugin to rebuild from the anchor list. */
export const SUGGESTION_ANCHOR_REBUILD = 'rebuild';

/**
 * Locate each anchor by its quote in the document text, mirroring the
 * server-side repair semantics: an anchor whose quote is missing or ambiguous
 * is skipped (those suggestions stay reachable from the Suggestions inbox).
 * Anchors store plainText offsets at a past revision, so the stored from/to
 * are never trusted — only the quote is.
 */
function buildDecorations(
	doc: ProseMirrorNode,
	anchored: readonly AnchoredSuggestion[],
	renderWidget: (suggestionId: SuggestionId) => RenderedWidget
): DecorationSet {
	if (anchored.length === 0) return DecorationSet.empty;
	// Flatten the document into text plus a per-character ProseMirror position
	// map. Block boundaries become separator characters without a position.
	let text = '';
	const positions: number[] = [];
	doc.descendants((node, pos) => {
		if (node.isText && node.text) {
			for (let index = 0; index < node.text.length; index++) {
				text += node.text[index];
				positions.push(pos + index);
			}
		} else if (node.isBlock && text.length > 0 && !text.endsWith('\n')) {
			text += '\n';
			positions.push(-1);
		}
		return true;
	});
	const decorations: Decoration[] = [];
	for (const anchor of anchored) {
		const quote = anchor.quote;
		if (!quote) continue;
		const first = text.indexOf(quote);
		if (first < 0 || first !== text.lastIndexOf(quote)) continue;
		const fromPos = positions[first];
		const toPos = positions[first + quote.length - 1];
		if (fromPos === undefined || toPos === undefined || fromPos < 0 || toPos < 0) continue;
		decorations.push(
			Decoration.inline(fromPos, toPos + 1, {
				class: `suggestion-anchor suggestion-anchor--${anchor.kind}`,
				'data-suggestion-id': anchor.id
			})
		);
		// Place the accept/dismiss widget just after the textblock containing
		// the anchor, like a code-review suggested change.
		let widgetPos = toPos + 1;
		try {
			const $to = doc.resolve(toPos + 1);
			widgetPos = $to.after($to.depth);
		} catch {
			// Anchor at the document edge — fall back to right after the quote.
		}
		let rendered: RenderedWidget | null = null;
		decorations.push(
			Decoration.widget(
				widgetPos,
				() => {
					rendered = renderWidget(anchor.id);
					return rendered.dom;
				},
				{
					// Same key ⇒ ProseMirror reuses the DOM across rebuilds instead
					// of remounting the Svelte component.
					key: `suggestion-widget-${anchor.id}`,
					side: -1,
					destroy: () => rendered?.destroy(),
					// Keep clicks on Accept/Dismiss out of the editor's handlers.
					stopEvent: () => true
				}
			)
		);
	}
	return DecorationSet.create(doc, decorations);
}

export function createSuggestionAnchorPlugin(options: {
	getAnchored: () => readonly AnchoredSuggestion[];
	renderWidget: (suggestionId: SuggestionId) => RenderedWidget;
}): Plugin {
	return new Plugin<DecorationSet>({
		key: suggestionAnchorKey,
		state: {
			init: (_, state) => buildDecorations(state.doc, options.getAnchored(), options.renderWidget),
			apply: (tr, previous) => {
				if (tr.getMeta(suggestionAnchorKey) === SUGGESTION_ANCHOR_REBUILD) {
					return buildDecorations(tr.doc, options.getAnchored(), options.renderWidget);
				}
				return tr.docChanged ? previous.map(tr.mapping, tr.doc) : previous;
			}
		},
		props: {
			decorations(state) {
				return suggestionAnchorKey.getState(state);
			}
		}
	});
}
