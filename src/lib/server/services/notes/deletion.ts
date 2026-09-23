import type { Note } from '$lib/models/notes';

/** Permanent deletion includes visible trashed descendants, in children-first order. */
export function prepareNoteDeletion(
	trashed: readonly Note[],
	scope: { kind: 'one'; note: Note } | { kind: 'all' }
):
	| { kind: 'invalid'; message: string }
	| { kind: 'delete'; notes: readonly Pick<Note, 'id' | 'title'>[] } {
	if (scope.kind === 'one') {
		if (!scope.note.archivedAt)
			return { kind: 'invalid', message: 'Only notes in the trash can be deleted permanently' };
		if (scope.note.kind === 'skill')
			return { kind: 'invalid', message: 'Skill notes are not deleted from the trash' };
		if (!trashed.some((note) => note.id === scope.note.id))
			return { kind: 'invalid', message: 'The note is no longer in the trash' };
	}
	// Skills are absent from the visible trash. Emptying it must not destroy hidden skills.
	const visible = trashed.filter((note) => note.archivedAt && note.kind !== 'skill');
	const roots = scope.kind === 'all' ? visible : [scope.note];
	const seen = new Set<Note['id']>();
	const ordered: Pick<Note, 'id' | 'title'>[] = [];
	const visit = (note: Note): void => {
		if (seen.has(note.id)) return;
		seen.add(note.id);
		for (const child of visible.filter((candidate) => candidate.parentId === note.id)) visit(child);
		ordered.push({ id: note.id, title: note.title });
	};
	for (const root of roots) visit(root);
	return { kind: 'delete', notes: ordered };
}
