import type {
	ProjectEntryReference,
	ProjectTreeNode,
	ExportTreeNode,
	ProjectExportEntry
} from '$lib/models/projects';
import type { NoteId, NoteSummary } from '$lib/models/notes';
import { ValidationError } from '$lib/errors';

/** Preserve the adapter's sibling order while assembling the same tree on both sides. */
function assembleProjectTree<Entry extends Pick<ProjectEntryReference, 'id' | 'parentId' | 'kind'>>(
	entries: readonly Entry[]
): readonly ProjectTreeNode<Entry>[] {
	const children = new Map<NoteId | undefined, Entry[]>();
	for (const entry of entries) {
		if (entry.kind === 'skill') continue;
		const siblings = children.get(entry.parentId) ?? [];
		siblings.push(entry);
		children.set(entry.parentId, siblings);
	}
	const build = (parentId: NoteId | undefined): ProjectTreeNode<Entry>[] =>
		(children.get(parentId) ?? []).map((entry) => ({ entry, children: build(entry.id) }));
	return build(undefined);
}

/** Follow the actual parent chain, including a parent whose body has not arrived yet. */
function ancestorFolderIds(
	note: Pick<NoteSummary, 'id' | 'parentId'>,
	entries: ReadonlyMap<NoteId, Pick<NoteSummary, 'parentId'>>
): readonly NoteId[] {
	const ancestors: NoteId[] = [];
	const visited = new Set<NoteId>([note.id]);
	let parentId = note.parentId;
	while (parentId) {
		if (visited.has(parentId)) throw new ValidationError('Project tree contains a parent cycle');
		visited.add(parentId);
		ancestors.push(parentId);
		parentId = entries.get(parentId)?.parentId;
	}
	return ancestors;
}

/** Whether `note` is `rootId` itself or sits anywhere below it. */
function isWithinSubtree(
	note: Pick<NoteSummary, 'id' | 'parentId'>,
	rootId: NoteId,
	entries: ReadonlyMap<NoteId, Pick<NoteSummary, 'parentId'>>
): boolean {
	return note.id === rootId || ancestorFolderIds(note, entries).includes(rootId);
}

/**
 * The notes under a set of tree nodes, each carrying the path it will take inside a zip.
 *
 * The nodes passed in are the archive root, so the exported folder's own name is not
 * repeated in every path. Folders contribute structure, never a file of their own — an
 * empty one therefore yields nothing at all.
 */
function projectExportEntries(
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
export interface ProjectTreePresentation {
	assemble<Entry extends Pick<ProjectEntryReference, 'id' | 'parentId' | 'kind'>>(
		entries: readonly Entry[]
	): readonly ProjectTreeNode<Entry>[];
	ancestors(
		note: Pick<NoteSummary, 'id' | 'parentId'>,
		entries: ReadonlyMap<NoteId, Pick<NoteSummary, 'parentId'>>
	): readonly NoteId[];
	contains(
		note: Pick<NoteSummary, 'id' | 'parentId'>,
		rootId: NoteId,
		entries: ReadonlyMap<NoteId, Pick<NoteSummary, 'parentId'>>
	): boolean;
	exportEntries(nodes: readonly ExportTreeNode[]): ProjectExportEntry[];
}
export class ProjectTreePresentationService implements ProjectTreePresentation {
	assemble<Entry extends Pick<ProjectEntryReference, 'id' | 'parentId' | 'kind'>>(
		entries: readonly Entry[]
	) {
		return assembleProjectTree(entries);
	}
	ancestors(
		note: Pick<NoteSummary, 'id' | 'parentId'>,
		entries: ReadonlyMap<NoteId, Pick<NoteSummary, 'parentId'>>
	) {
		return ancestorFolderIds(note, entries);
	}
	contains(
		note: Pick<NoteSummary, 'id' | 'parentId'>,
		rootId: NoteId,
		entries: ReadonlyMap<NoteId, Pick<NoteSummary, 'parentId'>>
	) {
		return isWithinSubtree(note, rootId, entries);
	}
	exportEntries(nodes: readonly ExportTreeNode[]) {
		return projectExportEntries(nodes);
	}
}
