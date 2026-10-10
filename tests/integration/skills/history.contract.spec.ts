import { noteEtag } from '$lib/models/notes';
import { Notes, type NotesDependencies } from '$lib/server/controllers/notes/controller';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createNotesCapability } from '$lib/server/factories/capabilities/notes-capability-factory';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { NoteArchiveImportService } from '$lib/server/services/notes/import';
import { NotePatchPreparationService } from '$lib/server/services/notes/patches';
import { NoteRevisionComparisonService } from '$lib/server/services/notes/revision-diff';
import { NoteEditingService as NoteEditingRulesService } from '$lib/services/notes/editing';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { NotePresentationService } from '$lib/services/notes/presentation';
import { NoteReferenceService } from '$lib/services/notes/references';
import { NoteSectionNumberingService } from '$lib/services/notes/section-numbering';
import { NoteTextSearchService } from '$lib/services/notes/text-search';
import { ProvenancePresentationService } from '$lib/services/provenance/presentation';
import { ReferencePresentationService } from '$lib/services/references/presentation';
import { BacklinkPresentationService } from '$lib/services/relationships/presentation';
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
import { TodoPresentationService } from '$lib/services/todos/presentation';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { expect, it } from 'vitest';
import { actor, context, seedNote } from '../database-harness';
import { skillController } from './edit-harness';

it('lists persisted skill snapshots newest first while leaving the current draft out of history', async () => {
	const { owner, project } = await seedNote('21401');
	const { database, transactionRunner } = createTransactionContext(context.db);
	const skills = skillController(database, transactionRunner);
	const { services: catalog } = createNotesCapability({
		db: database,
		projects: new ProjectRecords(database)
	});
	const notes = new Notes(
		new BacklinkPresentationService(),
		new ReferencePresentationService(),
		new WorkspaceCommandRulesService(),
		new ProvenancePresentationService(),
		capabilityDependencies<NotesDependencies>({
			...agentToolResultsFixture(),
			archiveImport: new NoteArchiveImportService(),
			patchPreparation: new NotePatchPreparationService(),
			revisionComparison: new NoteRevisionComparisonService(),
			todoPresentation: new TodoPresentationService(),
			textSearch: new NoteTextSearchService(),
			noteReferences: new NoteReferenceService(),
			sections: new NoteSectionNumberingService(),
			noteCreationRules: new NoteLifecycleRulesService(),
			noteTrashRules: new NoteLifecycleRulesService(),
			notePublicationRules: new NoteLifecycleRulesService(),
			noteEditingRules: new NoteEditingRulesService(),
			notePresentation: new NotePresentationService(),
			suggestionPresentation: new SuggestionPresentationService(),
			transactionRunner,
			notePublisher: catalog.publisher,
			revisionRecorder: catalog.revisionRecorder
		})
	);
	const created = await skills.create(owner, { projectId: project.id, name: 'Review' });
	await notes.publish(owner, {
		noteId: created.skill.note.id,
		baseEtag: noteEtag(created.skill.note.id, created.skill.note.currentRevision)
	});
	const second = await skills.update(owner, {
		noteId: created.skill.note.id,
		content: {
			kind: 'instructions',
			text: 'Second instructions',
			baseRevision: created.skill.note.currentRevision
		}
	});
	await notes.publish(owner, {
		noteId: second.skill.note.id,
		baseEtag: noteEtag(second.skill.note.id, second.skill.note.currentRevision)
	});
	await skills.update(owner, {
		noteId: second.skill.note.id,
		content: {
			kind: 'instructions',
			text: 'Unpublished draft',
			baseRevision: second.skill.note.currentRevision
		}
	});
	expect(
		(await skills.listVersions(owner, { noteId: created.skill.note.id })).map((item) => ({
			revision: item.revision,
			text: item.plainText
		}))
	).toEqual([
		{ revision: 2, text: 'Second instructions' },
		{ revision: 1, text: '' }
	]);
});
it('refuses another account’s skill history', async () => {
	const { owner, project } = await seedNote('21402');
	const tx = createTransactionContext(context.db);
	const skills = skillController(tx.database, tx.transactionRunner);
	const { skill } = await skills.create(owner, { projectId: project.id, name: 'Review' });
	await expect(
		skills.listVersions(actor('21403'), { noteId: skill.note.id })
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
