import { describe, expect, it } from 'vitest';
import { Skills, type SkillsDependencies } from './controller';
import { NoteCatalog } from '$lib/server/services/notes/catalog';
import { SkillLibrary } from '$lib/server/services/skills/library';
import { InMemorySkillRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	noteBuilder,
	projectBuilder,
	testActor,
	testNoteId,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const noteRepository = new InMemoryNoteRepository();
	const projects = new InMemoryProjectRepository();
	projects.projects = [projectBuilder()];
	const notes = new NoteCatalog(noteRepository, new InMemoryAnchorRepository(), projects);
	const skills = new InMemorySkillRepository(noteRepository);
	const library = new SkillLibrary(skills, noteRepository, new InMemoryProvenanceRepository());
	const content = new InMemoryNoteContent();
	const controller = new Skills(
		capabilityDependencies<SkillsDependencies>({
			skillCreator: library,
			noteEditor: notes,
			anchorRepairer: notes,
			noteLinkReconciler: content,
			noteIndexer: content,
			noteCreation: notes,
			transactionRunner: new InMemoryTransactionRunner([noteRepository, skills, content])
		})
	);
	return { controller, skills, noteRepository, content };
};

describe('Create skill invariants', () => {
	it('preserves the locally assigned identity of the skill and its backing note', async () => {
		const { controller } = setup();
		const id = testNoteId(501);
		const output = await controller.create(testActor(), {
			id,
			name: 'Offline skill',
			projectId: testProjectId()
		});
		expect(output.skill.note.id).toBe(id);
	});
	it('creates a skill named after the input', async () => {
		const { controller } = setup();
		const output = await controller.create(testActor(), {
			name: 'ADR writing',
			projectId: testProjectId()
		});
		expect(output.skill.note.title).toBe('ADR writing');
	});

	it('inserts a skill record for the new note', async () => {
		const { controller, skills } = setup();
		await controller.create(testActor(), { name: 'ADR writing', projectId: testProjectId() });
		expect(skills.skills).toHaveLength(1);
	});

	it('places the skill note inside the requested folder', async () => {
		const { controller, noteRepository, skills } = setup();
		noteRepository.notes = [noteBuilder({ kind: 'folder' })];
		await controller.create(testActor(), {
			name: 'ADR writing',
			projectId: testProjectId(),
			parentId: testNoteId()
		});
		expect(skills.skills[0]?.note.parentId).toBe(testNoteId());
	});

	it('rejects an empty skill name', async () => {
		const { controller } = setup();
		await expect(
			controller.create(testActor(), { name: '  ', projectId: testProjectId() })
		).rejects.toMatchObject({
			code: 'VALIDATION'
		});
	});
});

it('creates the initial instructions with the default description in one operation', async () => {
	const { controller } = setup();
	const input = {
		name: 'Reviewing changes',
		projectId: testProjectId(),
		instructions: 'Read the diff carefully.',
		description: ''
	};
	const { skill } = await controller.create(testActor(), input);
	expect({ text: skill.note.plainText, description: skill.description }).toEqual({
		text: input.instructions,
		description: 'Reusable instructions for Reviewing changes.'
	});
});
it('does not leave an empty skill when initial instruction indexing fails', async () => {
	const { controller, content, noteRepository, skills } = setup();
	content.failIndex = true;
	const input = {
		name: 'Reviewing changes',
		projectId: testProjectId(),
		instructions: 'Read the diff carefully.'
	};
	const outcome = await controller.create(testActor(), input).then(
		() => 'created',
		() => 'failed'
	);
	expect({ outcome, notes: noteRepository.notes.length, skills: skills.skills.length }).toEqual({
		outcome: 'failed',
		notes: 0,
		skills: 0
	});
});
it('does not leave a note when the supplied description is invalid', async () => {
	const { controller, noteRepository, skills } = setup();
	const input = {
		name: 'Reviewing changes',
		projectId: testProjectId(),
		instructions: 'Read the diff carefully.',
		description: 'x'.repeat(1025)
	};
	const outcome = await controller.create(testActor(), input).then(
		() => 'created',
		() => 'failed'
	);
	expect({ outcome, notes: noteRepository.notes.length, skills: skills.skills.length }).toEqual({
		outcome: 'failed',
		notes: 0,
		skills: 0
	});
});
