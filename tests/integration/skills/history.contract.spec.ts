import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
import { expect, it } from 'vitest';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { Notes, type NotesDependencies } from '$lib/server/controllers/notes/controller';
import { createNotesCapability } from '$lib/server/factories/capabilities/notes-capability-factory';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { noteEtag } from '$lib/services/notes/presentation';
import { actor, context, seedNote } from '../database-harness';
import { skillController } from './edit-harness';

it('lists persisted skill snapshots newest first while leaving the current draft out of history', async () => {
	const { owner, project } = await seedNote('21401');
	const { database, transactionRunner } = createTransactionContext(context.db);
	const skills = skillController(database, transactionRunner);
	const { catalog } = createNotesCapability({
		db: database,
		projects: new ProjectRecords(database)
	});
	const notes = new Notes(
		capabilityDependencies<NotesDependencies>({
			suggestionPresentation: new SuggestionPresentationService(),
			transactionRunner,
			notePublisher: catalog,
			revisionRecorder: catalog
		})
	);
	const created = await skills.create(owner, { projectId: project.id, name: 'Review' });
	await notes.publish(owner, {
		noteId: created.skill.note.id,
		baseEtag: noteEtag(created.skill.note)
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
		baseEtag: noteEtag(second.skill.note)
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
