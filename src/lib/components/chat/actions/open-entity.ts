import { goto } from '$app/navigation';
import { page } from '$app/state';
import type { NoteId } from '$lib/models/notes';
import type { EntityKind, EntityRef } from '$lib/components/agent';
import { workbench } from '$lib/stores/workbench/workbench.svelte';
import {
	FtDocument,
	FtFolder,
	FtMemory,
	FtSettings,
	FtSkills,
	FtSuggestion,
	FtTodos,
	FtArtifacts,
	FtReading
} from '$lib/components/icons';

/**
 * Where each kind of thing lives, and what it looks like in a row. Shared so the turn's
 * touched list and the rows behind its log door open the same things the same way — two
 * routings would eventually disagree, and the one that drifted would be the one nobody
 * clicked in testing.
 */

export const entityIcon: Readonly<Record<EntityKind, typeof FtDocument>> = {
	note: FtDocument,
	todo: FtTodos,
	project: FtFolder,
	skill: FtSkills,
	artifact: FtArtifacts,
	memory: FtMemory,
	suggestion: FtSuggestion,
	setting: FtSettings,
	plain: FtReading
};

/** Kinds that have somewhere to be opened. The rest are named but not offered as links. */
const routable = new Set<EntityKind>(['note', 'skill', 'todo', 'project']);

export const canOpenEntity = (entity: Pick<EntityRef, 'kind' | 'id'>): boolean =>
	Boolean(entity.id) && routable.has(entity.kind);

/**
 * Each kind opens where that kind lives — and none of them may cost the reader the panel they
 * clicked in. `openTodoSurface` is the obvious reuse and is wrong here: docked, it hands the
 * right panel to the todo and the conversation is gone.
 */
export function openEntity(entity: Pick<EntityRef, 'kind' | 'id'>): void {
	if (!canOpenEntity(entity)) return;
	const id = entity.id as string;
	if (entity.kind === 'note' || entity.kind === 'skill') {
		void workbench.openTab(id as NoteId);
		return;
	}
	if (entity.kind === 'todo') {
		const returnTo = `${page.url.pathname}${page.url.search}`;
		void goto(`/todos/${id}?returnTo=${encodeURIComponent(returnTo)}`);
		return;
	}
	void goto(`/projects/${id}`);
}
