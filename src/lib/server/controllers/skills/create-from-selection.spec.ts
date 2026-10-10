import { NoteEditingService as NoteEditingRulesService } from '$lib/services/notes/editing';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { SelectionOrigins } from '$lib/server/services/notes/selection-origin';
import { SkillLibrary } from '$lib/server/services/skills/library';
import { describe, expect, it } from 'vitest';
import { createNoteServices } from '$lib/server/factories/capabilities/notes-capability-factory';
import {
	InMemoryNoteRepository,
	InMemoryAnchorRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { projectBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { Skills, type SkillsDependencies } from './controller';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemorySkillRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	noteBuilder,
	testActor,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const notes = new InMemoryNoteContent();
	notes.notes = [
		noteBuilder({
			plainText: 'Always capture consequences.',
			document: {
				type: 'doc',
				content: [
					{ type: 'paragraph', content: [{ type: 'text', text: 'Always capture consequences.' }] }
				]
			}
		})
	];
	const repository = new InMemoryNoteRepository();
	repository.notes = [...notes.notes];
	const projects = new InMemoryProjectRepository();
	projects.projects = [projectBuilder()];
	const anchors = new InMemoryAnchorRepository();
	const catalog = createNoteServices(repository, anchors, projects);
	const skills = new InMemorySkillRepository(repository);
	const provenance = new InMemoryProvenanceRepository();
	const library = new SkillLibrary(skills, repository, provenance);
	const controller = new Skills(
		capabilityDependencies<SkillsDependencies>({
			noteCreationRules: new NoteLifecycleRulesService(),
			noteEditingRules: new NoteEditingRulesService(),
			selectionOrigins: new SelectionOrigins(repository, anchors, provenance),
			noteCreation: catalog.creator,
			noteEditor: catalog.editor,
			anchorRepairer: catalog.anchorRepairer,
			noteLinkReconciler: notes,
			noteIndexer: notes,
			skillCreator: library,
			transactionRunner: new InMemoryTransactionRunner([
				notes,
				provenance,
				skills,
				repository,
				anchors
			])
		})
	);
	return { controller, notes, skills, provenance, repository, anchors };
};

const input = {
	selection: {
		noteId: testNoteId(),
		revision: 1,
		from: 0,
		to: 28,
		text: 'Always capture consequences.'
	},
	name: 'Decision quality',
	description: 'Improves architecture decisions',
	triggerHints: ['decision']
};

describe('Create skill workflow invariants', () => {
	it('creates a skill document from the selected text', async () => {
		const { controller, skills, anchors, provenance } = setup();
		const { skillNoteId } = await controller.createFromSelection(testActor(), input);
		expect({
			id: skills.skills[0]?.note.id,
			text: skills.skills[0]?.note.plainText,
			projectId: skills.skills[0]?.note.projectId,
			anchor: anchors.anchors,
			provenance: provenance.provenance
		}).toMatchObject({
			id: skillNoteId,
			text: input.selection.text,
			projectId: noteBuilder().projectId,
			anchor: [{ noteId: input.selection.noteId, quote: input.selection.text }],
			provenance: [
				{ sourceAnchorId: anchors.anchors[0]?.id, userId: testActor().userId, producerKind: 'user' }
			]
		});
	});

	it('rolls back the source records and candidate skill when metadata validation fails', async () => {
		const { controller, anchors, provenance, repository, skills } = setup();
		const result = await controller
			.createFromSelection(testActor(), { ...input, description: 'x'.repeat(1025) })
			.then(
				() => 'created',
				() => 'failed'
			);
		expect({
			result,
			anchors: anchors.anchors,
			provenance: provenance.provenance,
			skills: skills.skills,
			notes: repository.notes.map((note) => note.id)
		}).toEqual({
			result: 'failed',
			anchors: [],
			provenance: [],
			skills: [],
			notes: [testNoteId()]
		});
	});
	it('rejects an empty name before inserting the skill document', async () => {
		const { controller } = setup();
		await expect(
			controller.createFromSelection(testActor(), { ...input, name: ' ' })
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});
	it.each([
		{
			label: 'stale revision',
			selection: { ...input.selection, revision: 2 },
			code: 'STALE_REVISION'
		},
		{
			label: 'mismatched text',
			selection: { ...input.selection, text: 'Wrong quote' },
			code: 'VALIDATION'
		},
		{ label: 'outside range', selection: { ...input.selection, to: 99 }, code: 'VALIDATION' }
	])('rejects $label without creating a skill', async ({ selection, code }) => {
		const { controller, repository, anchors, provenance, skills } = setup();
		const result = await controller.createFromSelection(testActor(), { ...input, selection }).then(
			() => ({ kind: 'success' }),
			(error: Error & { code: string }) => ({ kind: 'failure', code: error.code })
		);
		expect({
			result,
			notes: repository.notes.map((note) => note.id),
			anchors: anchors.anchors,
			provenance: provenance.provenance,
			skills: skills.skills
		}).toEqual({
			result: { kind: 'failure', code },
			notes: [testNoteId()],
			anchors: [],
			provenance: [],
			skills: []
		});
	});
});
