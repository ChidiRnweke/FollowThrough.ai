import { InMemorySelectionOrigins } from '$lib/testing/notes/fakes/in-memory-selection-origins';
import { describe, expect, it } from 'vitest';
import { NoteCatalog } from '$lib/server/services/notes/catalog';
import {
	InMemoryNoteRepository,
	InMemoryAnchorRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { projectBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { Skills, type SkillsDependencies } from './controller';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemorySkillCreator } from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { InMemoryProvenanceRecorder } from '$lib/testing/relationships/fakes/in-memory-pipelines';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	noteBuilder,
	testActor,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const notes = new InMemoryNoteContent();
	notes.notes = [noteBuilder({ plainText: 'Always capture consequences.' })];
	const repository = new InMemoryNoteRepository();
	repository.notes = [...notes.notes];
	const projects = new InMemoryProjectRepository();
	projects.projects = [projectBuilder()];
	const catalog = new NoteCatalog(repository, new InMemoryAnchorRepository(), projects);
	const skills = new InMemorySkillCreator();
	const provenance = new InMemoryProvenanceRecorder();
	const controller = new Skills(
		capabilityDependencies<SkillsDependencies>({
			selectionOrigins: new InMemorySelectionOrigins(notes, provenance),
			noteCreator: catalog,
			noteEditor: catalog,
			anchorRepairer: catalog,
			noteLinkReconciler: notes,
			noteIndexer: notes,
			skillCreator: skills,
			transactionRunner: new InMemoryTransactionRunner([notes, provenance, skills])
		})
	);
	return { controller, notes, skills, provenance, repository };
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
	it('creates the skill document in the source project', async () => {
		const { controller, skills } = setup();
		await controller.createFromSelection(testActor(), input);
		expect(skills.skills[0]?.note.projectId).toBe(noteBuilder().projectId);
	});
	it('rejects an empty name before inserting the skill document', async () => {
		const { controller, repository } = setup();
		await controller
			.createFromSelection(testActor(), { ...input, name: ' ' })
			.catch(() => undefined);
		expect(repository.notes).toHaveLength(1);
	});
});
