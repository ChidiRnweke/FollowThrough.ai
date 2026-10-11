import type { ProjectTreePresentation } from '$lib/services/projects/presentation';
import type { ExportTreeNode, ProjectExportEntry } from '$lib/models/projects';
import type { NoteId, NoteSummary } from '$lib/models/notes';

export interface ProjectTreeController {
	exportEntries(nodes: readonly ExportTreeNode[]): readonly ProjectExportEntry[];
	revealPath(
		note: Pick<NoteSummary, 'id' | 'parentId'>,
		entries: ReadonlyMap<NoteId, Pick<NoteSummary, 'parentId'>>
	): readonly NoteId[];
	contains(
		note: Pick<NoteSummary, 'id' | 'parentId'>,
		rootId: NoteId,
		entries: ReadonlyMap<NoteId, Pick<NoteSummary, 'parentId'>>
	): boolean;
}

/** Tree navigation and export preparation share the same hierarchy rules as server reads. */
export class ProjectTrees implements ProjectTreeController {
	constructor(private readonly presentation: ProjectTreePresentation) {}
	exportEntries(nodes: readonly ExportTreeNode[]): readonly ProjectExportEntry[] {
		return this.presentation.exportEntries(nodes);
	}
	revealPath(
		note: Pick<NoteSummary, 'id' | 'parentId'>,
		entries: ReadonlyMap<NoteId, Pick<NoteSummary, 'parentId'>>
	): readonly NoteId[] {
		return this.presentation.ancestors(note, entries);
	}
	contains(
		note: Pick<NoteSummary, 'id' | 'parentId'>,
		rootId: NoteId,
		entries: ReadonlyMap<NoteId, Pick<NoteSummary, 'parentId'>>
	): boolean {
		return this.presentation.contains(note, rootId, entries);
	}
}
