import type { EditorState } from '@tiptap/pm/state';

/** A selection holding one diagram or one image and nothing else. */
export type LoneMedia =
	| { readonly kind: 'mermaid'; readonly source: string }
	| { readonly kind: 'image'; readonly src: string };

export interface SelectionMedia {
	readonly mermaidSources: readonly string[];
	readonly imageSrcs: readonly string[];
	/**
	 * Set only when the selection is a single diagram or image with no other
	 * content, the case where the whole clipboard can become that one picture.
	 */
	readonly lone: LoneMedia | undefined;
}

/**
 * What a copy would carry: the diagrams and images inside the selection, and
 * whether one of them is the only thing selected.
 *
 * Lives apart from `editor.ts` so the decision stays testable in a node
 * environment: the editor module pulls in Svelte node views and the mermaid
 * bundle, neither of which a headless spec can load.
 */
export const selectionMedia = (state: EditorState): SelectionMedia => {
	const mermaidSources: string[] = [];
	const imageSrcs: string[] = [];
	let otherText = '';
	state.selection.content().content.descendants((node) => {
		if (node.type.name === 'mermaid') {
			mermaidSources.push(node.textContent);
			// The source is the node's text content, and it is not prose the copy carries.
			return false;
		}
		if (node.type.name === 'image') {
			const src = node.attrs.src;
			if (typeof src === 'string' && src) imageSrcs.push(src);
			return false;
		}
		if (node.isText) otherText += node.text ?? '';
		return true;
	});
	// Whitespace-only prose around a picture — the paragraph a block image sits in,
	// a trailing newline — does not make the selection a mixed one.
	const alone = mermaidSources.length + imageSrcs.length === 1 && otherText.trim() === '';
	const lone: LoneMedia | undefined = !alone
		? undefined
		: mermaidSources.length === 1
			? { kind: 'mermaid', source: mermaidSources[0] }
			: { kind: 'image', src: imageSrcs[0] };
	return { mermaidSources, imageSrcs, lone };
};

/** Whether a copy needs the picture-inlining path at all. */
export const hasMedia = (media: SelectionMedia): boolean =>
	media.mermaidSources.length > 0 || media.imageSrcs.length > 0;
