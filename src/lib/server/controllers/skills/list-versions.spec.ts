import type { NoteRevisionId } from '$lib/models/notes';
import { createNoteServices } from '$lib/server/factories/capabilities/notes-capability-factory';
import { createSkillServices } from '$lib/server/factories/capabilities/skills-capability-factory';
import { NoteEditingService as NoteEditingRulesService } from '$lib/services/notes/editing';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { NoteReferenceService } from '$lib/services/notes/references';
import { SkillPortabilityService } from '$lib/services/skills/manifest';
import { SkillMetadataEditingService } from '$lib/services/skills/metadata';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { InMemorySkillRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	noteBuilder,
	projectBuilder,
	testActor,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
import { expect, it } from 'vitest';
import { Skills, type SkillsDependencies } from './controller';

const setup = async () => {
	const notes = new InMemoryNoteRepository();
	const note = noteBuilder({ kind: 'skill', currentRevision: 3, publishedRevision: 2 });
	notes.notes = [note];
	notes.revisions = [1, 2].map((revision) => ({
		id: crypto.randomUUID() as NoteRevisionId,
		noteId: note.id,
		revision,
		title: `Instructions ${revision}`,
		document: { type: 'doc', content: [] },
		plainText: '',
		createdAt: testNow
	}));
	const library = createSkillServices(
		new InMemorySkillRepository(notes),
		notes,
		new InMemoryProvenanceRepository()
	);
	await library.creator.create(testActor(), note, {
		name: 'Review',
		description: 'Review changes',
		triggerHints: []
	});
	const projects = new InMemoryProjectRepository();
	projects.projects = [projectBuilder()];
	const catalog = createNoteServices(notes, new InMemoryAnchorRepository(), projects);
	const controller = new Skills(
		new WorkspaceCommandRulesService(),
		capabilityDependencies<SkillsDependencies>({
			...agentToolResultsFixture(),
			skillPortability: new SkillPortabilityService(),
			skillMetadataEditing: new SkillMetadataEditingService(),
			noteReferences: new NoteReferenceService(),
			noteCreationRules: new NoteLifecycleRulesService(),
			noteEditingRules: new NoteEditingRulesService(),
			skillFinder: library.finder,
			revisionReader: catalog.revisionReader
		})
	);
	return { controller, notes, note };
};
it('lists the newest immutable skill revision first', async () => {
	const { controller, note } = await setup();
	expect(
		(await controller.listVersions(testActor(), { noteId: note.id })).map((item) => item.revision)
	).toEqual([2, 1]);
});
it('does not offer revisions of an archived skill', async () => {
	const { controller, notes, note } = await setup();
	notes.notes = [{ ...note, archivedAt: testNow }];
	await expect(controller.listVersions(testActor(), { noteId: note.id })).rejects.toMatchObject({
		code: 'NOT_FOUND'
	});
});
