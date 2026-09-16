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
