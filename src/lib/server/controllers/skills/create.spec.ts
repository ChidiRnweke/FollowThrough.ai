import { describe, expect, it } from 'vitest';
import { Skills, type SkillsDependencies } from './controller';
import { NoteCatalog } from '$lib/server/services/notes/catalog';
import { InMemorySkillCreator } from '$lib/testing/fakes/in-memory-diagram-skills';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/fakes/in-memory-note-repositories';
import { InMemoryProjectRepository } from '$lib/testing/fakes/in-memory-project-repository';
import { InMemoryTransactionRunner } from '$lib/testing/fakes/in-memory-transaction';
import {
	noteBuilder,
	projectBuilder,
	testActor,
	testNoteId,
	testProjectId
} from '$lib/testing/fixtures/domain-builders';

const setup = () => {
	const noteRepository = new InMemoryNoteRepository();
	const projects = new InMemoryProjectRepository();
	projects.projects = [projectBuilder()];
	const notes = new NoteCatalog(noteRepository, new InMemoryAnchorRepository(), projects);
	const skills = new InMemorySkillCreator();
	const controller = new Skills({
		skillCreator: skills,
		noteCreator: notes,
		transactionRunner: new InMemoryTransactionRunner([skills])
	} as unknown as SkillsDependencies);
	return { controller, skills, noteRepository };
};

describe('Create skill invariants', () => {
	it('creates a skill named after the input', async () => {
		const { controller } = setup();
		const output = await controller.create(testActor(), { name: 'ADR writing' });
		expect(output.skill.name).toBe('ADR writing');
	});

	it('inserts a skill record for the new note', async () => {
		const { controller, skills } = setup();
		await controller.create(testActor(), { name: 'ADR writing' });
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
		await expect(controller.create(testActor(), { name: '  ' })).rejects.toMatchObject({
			code: 'VALIDATION'
		});
	});
});
