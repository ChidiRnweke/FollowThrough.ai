import type { ProjectEntryReference, ProjectTreeNode } from '$lib/models/projects';
import type { NoteId } from '$lib/models/notes';

/** Preserve the adapter's sibling order while assembling the same tree on both sides. */
export function assembleProjectTree<
	Entry extends Pick<ProjectEntryReference, 'id' | 'parentId' | 'kind'>
>(entries: readonly Entry[]): readonly ProjectTreeNode<Entry>[] {
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
