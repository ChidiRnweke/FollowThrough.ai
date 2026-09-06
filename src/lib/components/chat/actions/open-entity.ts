import { downloadArtifact } from '$lib/remote/deliverables/deliverables.remote';
import { toast } from 'svelte-sonner';
import { goto } from '$app/navigation';
import { page } from '$app/state';
import type { DiagramId } from '$lib/models/diagrams';
import type { NoteId } from '$lib/models/notes';
import type { EntityKind, EntityRef } from '$lib/components/agent';
import { workbench } from '$lib/stores/workbench/workbench.svelte';
import { diagramTab } from '$lib/stores/workbench/tab-ref';
import {
	FtDocument,
	FtFolder,
	FtMemory,
	FtSettings,
	FtSkills,
	FtSuggestion,
	FtTodos,
	FtArtifacts,
	FtReading,
	FtWorkflow
} from '$lib/components/icons';

/**
 * Where each kind of thing lives, and what it looks like in a row. Shared so the turn's
 * touched list and the rows behind its log door open the same things the same way — two
 * routings would eventually disagree, and the one that drifted would be the one nobody
 * clicked in testing.
 */

export const entityIcon: Readonly<Record<EntityKind, typeof FtDocument>> = {
	note: FtDocument,
	folder: FtFolder,
	attachment: FtArtifacts,
	todo: FtTodos,
	project: FtFolder,
	skill: FtSkills,
	// The same mark the project overview and the sidebar give Diagrams.
	diagram: FtWorkflow,
	artifact: FtArtifacts,
	memory: FtMemory,
	suggestion: FtSuggestion,
	setting: FtSettings,
	plain: FtReading
};

/** Kinds that have somewhere to be opened. The rest are named but not offered as links. */
const routable = new Set<EntityKind>(['note', 'skill', 'todo', 'project', 'diagram']);

export const canOpenEntity = (entity: Pick<EntityRef, 'kind' | 'id' | 'destination'>): boolean =>
	Boolean(entity.destination) || (Boolean(entity.id) && routable.has(entity.kind));

/**
 * Each kind opens where that kind lives — and none of them may cost the reader the panel they
 * clicked in. `openTodoSurface` is the obvious reuse and is wrong here: docked, it hands the
 * right panel to the todo and the conversation is gone.
 */
export function openEntity(entity: Pick<EntityRef, 'kind' | 'id' | 'destination'>): void {
	if (!canOpenEntity(entity)) return;
	if (entity.destination) {
		const destination = entity.destination;
		if (destination.kind === 'note') {
			void workbench.openTab(destination.noteId as NoteId);
			return;
		}
		if (destination.kind === 'page') {
			void goto(destination.href);
			return;
		}
		void downloadEntity(destination.artifactId);
		return;
	}
	const id = entity.id as string;
	if (entity.kind === 'note' || entity.kind === 'skill') {
		void workbench.openTab(id as NoteId);
		return;
	}
	// A diagram is a workbench tab of its own kind, not a note. It was routed as a note
	// until now, which meant the tab it opened could never load.
	if (entity.kind === 'diagram') {
		void workbench.openTab(diagramTab(id as DiagramId));
		return;
	}
	if (entity.kind === 'todo') {
		const returnTo = `${page.url.pathname}${page.url.search}`;
		void goto(`/todos/${id}?returnTo=${encodeURIComponent(returnTo)}`);
		return;
	}
	void goto(`/projects/${id}`);
}

/** Sign a fresh URL instead of replaying an expired download URL. */
async function downloadEntity(artifactId: string) {
	try {
		const { url } = await downloadArtifact({ artifactId });
		window.location.assign(url);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'The download failed.';
		toast.error(message);
		return { kind: 'failure', message };
	}
}
export function entityActionLabel(entity: EntityRef): string {
	if (entity.destination?.kind === 'download') return `Download ${entity.title}`;
	if (entity.destination?.kind === 'page') return `${entity.destination.label}: ${entity.title}`;
	if (entity.destination?.kind === 'note') return `Open note for ${entity.title} in a tab`;
	return `Open ${entity.title}${['note', 'skill', 'diagram'].includes(entity.kind) ? ' in a tab' : ''}`;
}
