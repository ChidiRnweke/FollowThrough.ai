import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';

/**
 * Keeps a paragraph between a heading and a diagram without reaching into
 * the diagram's source text. Tables use their existing visual margins;
 * inserting paragraphs beside them would undo the author's deletions.
 */
const DIAGRAM_NODE_NAMES = new Set(['mermaid', 'drawio']);

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
						if (previous?.typeName === 'heading' && DIAGRAM_NODE_NAMES.has(typeName)) {
							insertAt.push(previous.end);
						}
						if (previous && DIAGRAM_NODE_NAMES.has(previous.typeName) && typeName === 'heading') {
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
