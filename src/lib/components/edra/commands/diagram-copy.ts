import type { EditorState } from '@tiptap/pm/state';

/**
 * The diagram source when the selection contains exactly one mermaid node —
 * the case where copying it as a rendered image is unambiguous. Selections with
 * several diagrams, or none, keep the default copy behaviour.
 *
 * Lives apart from `editor.ts` so the decision stays testable in a node
 * environment: the editor module pulls in Svelte node views and the mermaid
 * bundle, neither of which a headless spec can load.
 */
export const singleMermaidSource = (state: EditorState): string | undefined => {
	const sources: string[] = [];
	state.selection.content().content.descendants((node) => {
		if (node.type.name === 'mermaid') sources.push(node.textContent);
		return true;
	});
	return sources.length === 1 ? sources[0] : undefined;
};
