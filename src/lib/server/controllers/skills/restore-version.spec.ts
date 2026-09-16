import { describe, expect, it } from 'vitest';
import { Skills, type SkillsDependencies } from './controller';
import { SkillLibrary } from '$lib/server/services/skills/library';
import { NoteCatalog } from '$lib/server/services/notes/catalog';
import { InMemorySkillRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import {
	InMemoryNoteRepository,
	InMemoryAnchorRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	noteBuilder,
	projectBuilder,
	testActor,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
const setup = () => {
	const notes = new InMemoryNoteRepository();
	const projects = new InMemoryProjectRepository();
	projects.projects = [projectBuilder()];
	const skills = new InMemorySkillRepository();
	const service = new SkillLibrary(skills, notes, new InMemoryProvenanceRepository());
	const catalog = new NoteCatalog(notes, new InMemoryAnchorRepository(), projects);
	const content = new InMemoryNoteContent();
	const controller = new Skills(
		capabilityDependencies<SkillsDependencies>({
			skillFinder: service,
			skillEditor: service,
			skillUsageLister: service,
			noteEditor: catalog,
			revisionReader: catalog,
			revisionRecorder: catalog,
			attachmentRestorer: catalog,
			anchorRepairer: catalog,
			noteIndexer: content,
			noteLinkReconciler: content,
			transactionRunner: new InMemoryTransactionRunner([])
		})
	);
	return { controller, service, notes, skills, catalog, content };
};

describe('Skill restoration', () => {
	it('restores an immutable skill snapshot as a new current revision', async () => {
		const { controller, skills, notes } = setup();
		const current = noteBuilder({
			kind: 'skill',
			title: 'Current instructions',
			plainText: 'Current content',
			currentRevision: 2
		});
		notes.notes[0] = current;
		notes.revisions = [
			{
				id: '00000000-0000-4000-0008-000000000001' as never,
				noteId: current.id,
				revision: 1,
				title: 'Original instructions',
				document: { type: 'doc', content: [] },
				plainText: 'Original content',
				createdAt: testNow
			}
		];
		skills.skills = [
			{
				note: current,
				name: current.title,
				description: 'Instructions',
				triggerHints: ['instruction'],
				isEnabled: true
			}
		];
		const { skill: restored } = await controller.restoreVersion(testActor(), {
			noteId: current.id,
			revision: 1
		});
		expect({
			revision: restored.note.currentRevision,
			title: restored.note.title,
			plainText: restored.note.plainText,
			versionCount: notes.revisions.length,
			restoredAttachmentSnapshot: notes.restoredAttachmentSnapshots[0]
		}).toEqual({
			revision: 3,
			title: 'Original instructions',
			plainText: 'Original content',
			versionCount: 2,
			restoredAttachmentSnapshot: '00000000-0000-4000-0008-000000000001'
		});
	});
});
