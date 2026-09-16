import type { ExportTreeNode, ProjectExportEntry } from '$lib/models/projects';

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
