/**
 * Flattening a project tree into the documents an export offers.
 *
 * Pure and structural, so both entry points reach the same answer: a folder row exporting
 * its own subtree, and the project menu exporting everything.
 */

/** The shape a project tree node needs to have to be flattened. */
export interface ExportTreeNode {
	readonly entry: {
		readonly id: string;
		readonly title: string;
		readonly kind: string;
	};
	readonly children: readonly ExportTreeNode[];
}

export interface ProjectExportEntry {
	readonly id: string;
	readonly title: string;
	/** Root-relative and extension-less, e.g. `Interviews/Round two`. */
	readonly path: string;
	/** Folders between the export root and this note, for the picker's indentation. */
	readonly depth: number;
}

/**
 * The notes under a set of tree nodes, each carrying the path it will take inside a zip.
 *
 * The nodes passed in are the archive root, so the exported folder's own name is not
 * repeated in every path. Folders contribute structure, never a file of their own — an
 * empty one therefore yields nothing at all.
 */
export function projectExportEntries(
	nodes: readonly ExportTreeNode[],
	prefix = '',
	depth = 0
): ProjectExportEntry[] {
	return nodes.flatMap((node) =>
		node.entry.kind === 'folder'
			? projectExportEntries(node.children, `${prefix}${node.entry.title}/`, depth + 1)
			: [
					{
						id: node.entry.id,
						title: node.entry.title,
						path: `${prefix}${node.entry.title}`,
						depth
					}
				]
	);
}
