import { NoteEditingService as NoteEditingRulesService } from '$lib/services/notes/editing';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { NotePresentationService } from '$lib/services/notes/presentation';
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
import type { ActorContext } from '$lib/models/identity';
import type { Note } from '$lib/models/notes';
import type { AtomicOperation } from '$lib/models/workspace';
import { Notes, type NotesDependencies } from '$lib/server/controllers/notes/controller';
import type { NoteEditor } from '$lib/server/services/notes/catalog';

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
			noteCreationRules: new NoteLifecycleRulesService(),
			noteTrashRules: new NoteLifecycleRulesService(),
			notePublicationRules: new NoteLifecycleRulesService(),
			noteEditingRules: new NoteEditingRulesService(),
			notePresentation: new NotePresentationService(),
			suggestionPresentation: new SuggestionPresentationService(),
			transactionRunner,
			noteEditor: editor,
			anchorRepairer: effects,
			noteLinkReconciler: effects,
			noteIndexer: effects
		})
	);
	return (await controller.save(actor, { note })).note;
}
