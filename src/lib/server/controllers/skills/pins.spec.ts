import { expect, it } from 'vitest';
import { Skills, type SkillsDependencies } from './controller';
import { SkillPins } from '$lib/server/services/skills/pins';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryNoteRepository } from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemorySkillRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	noteBuilder,
	projectBuilder,
	testActor,
	testNow,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const notes = new InMemoryNoteRepository();
	const note = noteBuilder({ kind: 'skill', isPinned: true });
	notes.notes = [note];
	const projects = new InMemoryProjectRepository();
	const project = projectBuilder({ id: testProjectId(2), name: 'Launch' });
	projects.projects = [projectBuilder(), project];
	const skills = new InMemorySkillRepository(notes);
	skills.skills = [
		{
			note,
			slug: 'release',
			description: 'Release guidance',
			triggerHints: [],
			metadata: {},
			allowImplicitInvocation: true,
			isEnabled: true
		}
	];
	const controller = new Skills(
		capabilityDependencies<SkillsDependencies>({
			skillPinWriter: new SkillPins(projects, notes, skills),
			transactionRunner: new InMemoryTransactionRunner([projects, notes, skills])
		})
	);
	return { controller, notes, projects, skills, note, project };
};

it('pins a skill stored elsewhere only in the selected project, idempotently', async () => {
	const { controller, skills, note, project } = setup();
	const change = { noteId: note.id, projectId: project.id, pinned: true };
	await controller.setPinned(testActor(), change);
	await controller.setPinned(testActor(), change);
	expect({
		pins: skills.pins,
		selected: (await skills.listAll(testActor(), project.id)).map((skill) => skill.isPinned),
		global: (await skills.listAll(testActor())).map((skill) => skill.isPinned)
	}).toEqual({
		pins: [{ skillNoteId: note.id, projectId: project.id }],
		selected: [true],
		global: [false]
	});
});

it('unpins one project without changing another project’s pin or the note pin', async () => {
	const { controller, skills, notes, note, project } = setup();
	await controller.setPinned(testActor(), {
		noteId: note.id,
		projectId: note.projectId,
		pinned: true
	});
	await controller.setPinned(testActor(), { noteId: note.id, projectId: project.id, pinned: true });
	await controller.setPinned(testActor(), {
		noteId: note.id,
		projectId: project.id,
		pinned: false
	});
	await controller.setPinned(testActor(), {
		noteId: note.id,
		projectId: project.id,
		pinned: false
	});
	expect({ pins: skills.pins, note: notes.notes[0] }).toEqual({
		pins: [{ skillNoteId: note.id, projectId: note.projectId }],
		note
	});
});

it.each(['target', 'source'] as const)(
	'rejects a pin when its %s project is archived',
	async (target) => {
		const { controller, projects, note, project } = setup();
		const id = target === 'target' ? project.id : note.projectId;
		projects.projects = projects.projects.map((item) =>
			item.id === id ? { ...item, archivedAt: testNow } : item
		);
		await expect(
			controller.setPinned(testActor(), { noteId: note.id, projectId: project.id, pinned: true })
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	}
);

it('rejects a pin in another actor’s project', async () => {
	const { controller, projects, note, project } = setup();
	projects.projects[1] = { ...project, userId: testActor(2).userId };
	await expect(
		controller.setPinned(testActor(), { noteId: note.id, projectId: project.id, pinned: true })
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

it('rejects a pin for an archived skill note', async () => {
	const { controller, notes, note, project } = setup();
	notes.notes = [{ ...note, archivedAt: testNow }];
	await expect(
		controller.setPinned(testActor(), { noteId: note.id, projectId: project.id, pinned: true })
	).rejects.toMatchObject({ code: 'VALIDATION' });
});
