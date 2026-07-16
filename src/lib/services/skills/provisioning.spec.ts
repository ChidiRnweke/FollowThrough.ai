import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT_NAME } from '$lib/models';
import { InMemoryProjectRepository } from '$lib/testing/fakes/in-memory-project-repository';
import { InMemoryNoteRepository } from '$lib/testing/fakes/in-memory-note-repositories';
import { InMemorySkillRepository } from '$lib/testing/fakes/in-memory-artifact-repositories';
import { projectBuilder, testActor } from '$lib/testing/fixtures/domain-builders';
import { DefaultBuiltInSkillProvisioner } from './provisioning';

const setup = () => {
	const projects = new InMemoryProjectRepository();
	projects.projects = [projectBuilder({ name: DEFAULT_PROJECT_NAME })];
	const notes = new InMemoryNoteRepository();
	const skills = new InMemorySkillRepository();
	return {
		notes,
		skills,
		provisioner: new DefaultBuiltInSkillProvisioner(projects, notes, skills)
	};
};

describe('Built-in skill provisioning invariants', () => {
	it('creates each visible built-in skill exactly once per user', async () => {
		const { provisioner, skills } = setup();
		await provisioner.ensure(testActor());
		await provisioner.ensure(testActor());
		expect(skills.skills.map((skill) => skill.name)).toEqual(['FollowThrough', 'Diagramming']);
	});

	it('does not recreate a user-renamed FollowThrough skill', async () => {
		const { provisioner, notes } = setup();
		await provisioner.ensure(testActor());
		const existing = notes.notes[0]!;
		notes.notes[0] = {
			...existing,
			title: 'My workbench instructions',
			plainText: 'My customized instructions'
		};
		await provisioner.ensure(testActor());
		expect(notes.notes.map((note) => note.title)).toEqual([
			'My workbench instructions',
			'Diagramming'
		]);
	});

	it('records the initial skill revision', async () => {
		const { provisioner, notes } = setup();
		await provisioner.ensure(testActor());
		expect(notes.revisions.map((revision) => revision.revision)).toEqual([1, 1]);
	});

	it('fails with guidance when the Diagramming skill is disabled', async () => {
		const { provisioner, skills } = setup();
		await provisioner.ensure(testActor());
		const diagramming = skills.skills.find((skill) => skill.note.builtInKey === 'diagramming')!;
		skills.skills = skills.skills.map((skill) =>
			skill.note.id === diagramming.note.id ? { ...skill, isEnabled: false } : skill
		);
		await expect(provisioner.load(testActor(), 'diagramming')).rejects.toThrow('Re-enable it');
	});
});
