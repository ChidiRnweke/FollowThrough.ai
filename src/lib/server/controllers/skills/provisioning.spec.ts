import { expect, it } from 'vitest';
import { Skills, type SkillsDependencies } from './controller';
import { builtInSkillsFixture } from '$lib/testing/skills/fixtures/built-ins';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { BuiltInSkills } from '$lib/server/services/skills/built-ins';
import { RETIRED_BUILT_INS } from '$lib/server/services/skills/built-in-definitions';

it('lists installed built-in skills on the first request', async () => {
	const state = builtInSkillsFixture();
	const controller = new Skills(capabilityDependencies<SkillsDependencies>(state));
	expect((await controller.list(testActor())).skills.map((skill) => skill.name)).toEqual([
		'FollowThrough',
		'Settings',
		'Diagramming'
	]);
});

it('rolls back the Inbox, skill notes and revisions when metadata cannot be stored', async () => {
	const state = builtInSkillsFixture();
	state.skills.writeFailure = new Error('Skill storage unavailable');
	const controller = new Skills(capabilityDependencies<SkillsDependencies>(state));
	const failure = await controller.list(testActor()).then(
		() => {
			throw new Error('Expected provisioning to fail');
		},
		(error: Error) => error.message
	);
	expect({
		failure,
		projects: state.projects.projects,
		notes: state.notes.notes,
		revisions: state.notes.revisions,
		skills: state.skills.skills
	}).toEqual({
		failure: 'Skill storage unavailable',
		projects: [],
		notes: [],
		revisions: [],
		skills: []
	});
});

it('does not create missing built-ins while loading one by key', async () => {
	const state = builtInSkillsFixture();
	await state.builtInSkills.load(testActor(), 'diagramming').then(
		() => {
			throw new Error('Expected a missing skill');
		},
		(error: Error) => {
			if (!error.message.includes('was not found')) throw error;
		}
	);
	expect({
		projects: state.projects.projects,
		notes: state.notes.notes,
		skills: state.skills.skills
	}).toEqual({ projects: [], notes: [], skills: [] });
});

it('preserves the released note and revision history when a built-in upgrade fails', async () => {
	const state = builtInSkillsFixture();
	const released = RETIRED_BUILT_INS.find((definition) => definition.key === 'followthrough')!;
	await state.transactionRunner.run(() =>
		new BuiltInSkills(state.projects, state.notes, state.skills, {
			active: [released],
			retired: []
		}).ensure(testActor())
	);
	const before = structuredClone({
		notes: state.notes.notes,
		revisions: state.notes.revisions,
		skills: state.skills.skills
	});
	state.skills.writeFailure = new Error('Skill upgrade unavailable');
	const controller = new Skills(capabilityDependencies<SkillsDependencies>(state));
	await controller.list(testActor()).then(
		() => {
			throw new Error('Expected upgrade failure');
		},
		(error: Error) => {
			if (error.message !== 'Skill upgrade unavailable') throw error;
		}
	);
	expect({
		notes: state.notes.notes,
		revisions: state.notes.revisions,
		skills: state.skills.skills
	}).toEqual(before);
});
