import { describe, expect, it } from 'vitest';
import { DefaultSkillsController, type SkillsDependencies } from './controller';
import { InMemoryNoteContent } from '$lib/testing/fakes/in-memory-content';
import { InMemorySkillCreator } from '$lib/testing/fakes/in-memory-diagram-skills';
import { InMemoryProvenanceRecorder } from '$lib/testing/fakes/in-memory-pipelines';
import { InMemoryTransactionRunner } from '$lib/testing/fakes/in-memory-transaction';
import { noteBuilder, testActor, testNoteId } from '$lib/testing/fixtures/domain-builders';

const setup = () => {
	const notes = new InMemoryNoteContent();
	notes.notes = [noteBuilder({ plainText: 'Always capture consequences.' })];
	const skills = new InMemorySkillCreator();
	const provenance = new InMemoryProvenanceRecorder();
	const controller = new DefaultSkillsController({
		anchorCreator: notes,
		skillCreator: skills,
		provenanceRecorder: provenance,
		transactionRunner: new InMemoryTransactionRunner([notes, provenance, skills])
	} as unknown as SkillsDependencies);
	return { controller, notes, skills, provenance };
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
		const { controller, skills } = setup();
		await controller.createFromSelection(testActor(), input);
		expect(skills.skills[0]?.note.plainText).toBe(input.selection.text);
	});

	it('records provenance against the source selection anchor', async () => {
		const { controller, notes, provenance } = setup();
		await controller.createFromSelection(testActor(), input);
		expect(provenance.records[0]?.sourceAnchorId).toBe(notes.anchors[0]?.id);
	});

	it('rolls back the anchor when skill creation fails', async () => {
		const { controller, notes, skills } = setup();
		skills.failCreation = true;
		await controller.createFromSelection(testActor(), input).catch(() => undefined);
		expect(notes.anchors).toEqual([]);
	});
});
