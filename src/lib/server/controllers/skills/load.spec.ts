import { expect, it } from 'vitest';
import { Skills, type SkillsDependencies } from './controller';
import { SkillLibrary } from '$lib/server/services/skills/library';
import { InMemoryNoteRepository } from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemorySkillRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	noteBuilder,
	testActor,
	testNow,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const notes = new InMemoryNoteRepository();
	const note = noteBuilder({ kind: 'skill', title: 'Release guide' });
	notes.notes = [note];
	const skills = new InMemorySkillRepository(notes);
	skills.skills = [
		{
			note,
			slug: 'release-guide',
			description: 'Release instructions',
			triggerHints: [],
			metadata: {},
			allowImplicitInvocation: true,
			isEnabled: true
		}
	];
	const provenance = new InMemoryProvenanceRepository();
	provenance.provenance = [
		{
			id: testProvenanceId(),
			userId: testActor().userId,
			producerKind: 'agent',
			producerName: 'Agent memory',
			pipeline: 'memory',
			metadata: {},
			createdAt: testNow
		}
	];
	const library = new SkillLibrary(skills, notes, provenance);
	const controller = new Skills(
		capabilityDependencies<SkillsDependencies>({
			skillFinder: library,
			skillUsageRecorder: library,
			skillUsageLister: library,
			transactionRunner: new InMemoryTransactionRunner([notes, skills])
		})
	);
	return { controller, skills, notes, note, provenance };
};

it('does not commit usage when the loaded response cannot be assembled', async () => {
	const { controller, skills, note } = setup();
	skills.usageReadFailure = new Error('Usage history unavailable');
	const result = await controller
		.loadForAgent(testActor(), {
			noteId: note.id,
			provenanceId: testProvenanceId()
		})
		.then(
			() => ({ kind: 'success' as const }),
			(error: Error) => ({ kind: 'failure' as const, message: error.message })
		);
	expect({ result, usages: skills.usages }).toEqual({
		result: { kind: 'failure', message: 'Usage history unavailable' },
		usages: []
	});
});

it('does not load or record usage for an archived skill', async () => {
	const { controller, skills, notes, note } = setup();
	notes.notes = [{ ...note, archivedAt: testNow }];
	const result = await controller
		.loadForAgent(testActor(), {
			noteId: note.id,
			provenanceId: testProvenanceId()
		})
		.then(
			() => ({ kind: 'success' as const }),
			(error: Error) => ({ kind: 'failure' as const, error })
		);
	expect({ result, usages: skills.usages }).toMatchObject({
		result: { kind: 'failure', error: { code: 'NOT_FOUND' } },
		usages: []
	});
});

it('returns the persisted usage for a context-free load', async () => {
	const { controller, skills, note } = setup();
	const result = await controller.loadForAgent(testActor(), {
		noteId: note.id,
		provenanceId: testProvenanceId()
	});
	expect({ skill: result.skill, usages: result.usages.map(({ usage }) => usage) }).toEqual({
		skill: skills.skills[0],
		usages: skills.usages
	});
});

it('rejects a load with another actor’s provenance without recording usage', async () => {
	const { controller, skills, provenance, note } = setup();
	provenance.provenance[0] = { ...provenance.provenance[0], userId: testActor(2).userId };
	const result = await controller
		.loadForAgent(testActor(), {
			noteId: note.id,
			provenanceId: testProvenanceId()
		})
		.then(
			() => ({ kind: 'success' as const }),
			(error: Error) => ({ kind: 'failure' as const, error })
		);
	expect({ result, usages: skills.usages }).toMatchObject({
		result: { kind: 'failure', error: { code: 'NOT_FOUND' } },
		usages: []
	});
});
