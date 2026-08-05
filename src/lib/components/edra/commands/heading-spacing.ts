import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';

/**
 * Keeps a title from ever sitting glued to a heavy block.
 *
 * A heading directly above or below a diagram or a table reads as attached to
 * it — the title of the diagram, not a title of a section. Notes the agent
 * writes happily produce `heading` followed immediately by a `mermaid` or
 * `table` node, and the Markdown round trip keeps that shape, so the editor
 * normalizes it back: after any change a `paragraph` sits strictly between a
 * heading and a heavy neighbour.
 *
 * The paragraph is inserted at a position outside the heavy node, so a
 * diagram's source text is never reached. The scan is cheap (top-level
 * blocks only) and idempotent — once the paragraph exists the invariant
 * holds and no further transaction is produced.
 */

const HEAVY_NODE_NAMES = new Set(['mermaid', 'drawio', 'table']);

export const HeadingSpacing = Extension.create({
	name: 'headingSpacing',

	addProseMirrorPlugins() {
		return [
			new Plugin({
				appendTransaction(_transactions, _oldState, newState) {
					const { doc, schema } = newState;
					const paragraph = schema.nodes.paragraph;
					if (!paragraph) return null;

					const insertAt: number[] = [];
					let previous: { typeName: string; end: number } | undefined;

					doc.forEach((node, offset) => {
						const typeName = node.type.name;
						if (previous?.typeName === 'heading' && HEAVY_NODE_NAMES.has(typeName)) {
							insertAt.push(previous.end);
						}
						if (previous && HEAVY_NODE_NAMES.has(previous.typeName) && typeName === 'heading') {
							insertAt.push(offset);
						}
						previous = { typeName, end: offset + node.nodeSize };
					});

					if (insertAt.length === 0) return null;

					const tr = newState.tr;
					// Right-to-left so earlier insertion points stay valid.
					for (const pos of insertAt.reverse()) {
						tr.insert(pos, paragraph.create());
					}
					return tr;
				}
			})
		];
	}
});
