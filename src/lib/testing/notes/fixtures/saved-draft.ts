import type { ActorContext } from '$lib/models/identity';
import type { Note } from '$lib/models/notes';
import type { AtomicOperation } from '$lib/models/workspace';
import { Notes, type NotesDependencies } from '$lib/server/controllers/notes/controller';
import type { NoteEditor } from '$lib/server/services/notes/contracts';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';

/** Seed through the real edit workflow; unrelated indexing/link effects remain in memory. */
export async function saveNoteDraft(
	editor: NoteEditor,
	transactionRunner: AtomicOperation,
	actor: ActorContext,
	note: Note
): Promise<Note> {
	const effects = new InMemoryNoteContent();
	const controller = new Notes(
		capabilityDependencies<NotesDependencies>({
			transactionRunner,
			noteEditor: editor,
			anchorRepairer: effects,
			noteLinkReconciler: effects,
			noteIndexer: effects
		})
	);
	return (await controller.save(actor, { note })).note;
}
