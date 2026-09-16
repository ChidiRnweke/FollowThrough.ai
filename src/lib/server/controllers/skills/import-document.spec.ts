import { describe, expect, it } from 'vitest';
import { Skills, type SkillsDependencies } from './controller';
import { SkillLibrary } from '$lib/server/services/skills/library';
import { readSkillManifest } from '$lib/remote/skills/manifest-reader.server';
import type { SkillEditInput } from '$lib/models/skills';
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
	testNoteId
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
const importSkill = () => {
	const state = setup();
	const note = noteBuilder({ kind: 'skill', title: 'Decision writing' });
	state.notes.notes = [note];
	state.skills.skills = [
		{
			note,
			name: note.title,
			slug: 'decision-writing',
			description: 'Writes decisions',
			triggerHints: [],
			isEnabled: true
		}
	];
	return { ...state, note };
};
const input: SkillEditInput = {
	noteId: testNoteId(),
	content: {
		kind: 'manifest',
		baseRevision: 1,
		manifest: readSkillManifest(
			'---\nname: decision-writing\ndescription: Writes decisions\n---\nWrite a decision and explain its consequences.'
		)
	}
};

describe('Skill document imports', () => {
	it('does not save instructions when their portable metadata is incomplete', async () => {
		const { controller, notes } = importSkill();
		const original = structuredClone(notes.notes);
		await controller
			.update(testActor(), {
				noteId: input.noteId,
				description: 'x'.repeat(1025),
				content: { kind: 'instructions', text: 'Replacement body', baseRevision: 1 }
			})
			.then(
				() => {
					throw new Error('Expected invalid portable metadata');
				},
				(error: Error) => {
					if (!error.message.includes('Invalid SKILL.md')) throw error;
				}
			);
		expect(notes.notes).toEqual(original);
	});
	it('rejects an imported portable name already used by another skill', async () => {
		const { controller, skills } = importSkill();
		skills.skills.push({
			note: noteBuilder({ id: testNoteId(2), kind: 'skill' }),
			name: 'Another skill',
			slug: 'already-used',
			description: 'Existing instructions',
			triggerHints: [],
			isEnabled: true
		});
		await expect(
			controller.update(testActor(), {
				noteId: input.noteId,
				content: {
					kind: 'manifest',
					baseRevision: 1,
					manifest: readSkillManifest('---\nname: already-used\ndescription: Imported\n---\nBody')
				}
			})
		).rejects.toThrow('A skill with this portable name already exists');
	});
	it('saves imported instructions as an unpublished draft without a snapshot', async () => {
		const { controller, notes } = importSkill();
		const result = await controller.update(testActor(), input);
		expect({
			text: result.skill.note.plainText,
			revision: result.skill.note.currentRevision,
			published: result.skill.note.publishedRevision,
			snapshots: notes.revisions.length
		}).toEqual({
			text: 'Write a decision and explain its consequences.',
			revision: 2,
			published: 0,
			snapshots: 0
		});
	});
	it('indexes the imported document', async () => {
		const { controller, content } = importSkill();
		await controller.update(testActor(), input);
		expect(content.indexedNoteIds).toEqual([testNoteId()]);
	});
	it('refuses an import if the conditional document write loses a race', async () => {
		const { controller, notes } = importSkill();
		notes.failNextConditionalUpdate = true;
		await expect(controller.update(testActor(), input)).rejects.toMatchObject({
			code: 'STALE_REVISION'
		});
	});
	it('leaves document history unchanged for metadata-only edits', async () => {
		const { controller, notes, note } = importSkill();
		await controller.update(testActor(), { noteId: note.id, description: 'New metadata' });
		expect({ note: notes.notes[0], revisions: notes.revisions }).toEqual({ note, revisions: [] });
	});
	it('creates a snapshot only when the imported document is recorded for publication', async () => {
		const { controller, catalog, notes } = importSkill();
		const result = await controller.update(testActor(), input);
		await catalog.record(testActor(), result.skill.note);
		await catalog.markPublished(testActor(), result.skill.note.id);
		expect(notes.revisions.map((snapshot) => snapshot.plainText)).toEqual([
			'Write a decision and explain its consequences.'
		]);
	});
	it('refuses imported content based on an older editor revision', async () => {
		const { controller, catalog, note } = importSkill();
		await catalog.save(testActor(), { ...note, plainText: 'A newer edit' });
		await expect(controller.update(testActor(), input)).rejects.toMatchObject({
			code: 'STALE_REVISION'
		});
	});
	it('accepts the same import again after its first response was lost', async () => {
		const { controller, notes } = importSkill();
		await controller.update(testActor(), input);
		await controller.update(testActor(), input);
		expect(notes.notes[0]?.currentRevision).toBe(2);
	});
	it('prepares wizard instructions using the current skill metadata', async () => {
		const { controller } = importSkill();
		const result = await controller.update(testActor(), {
			noteId: input.noteId,
			content: { kind: 'instructions', text: 'Wizard instructions', baseRevision: 1 },
			description: 'Wizard description'
		});
		expect({ description: result.skill.description, text: result.skill.note.plainText }).toEqual({
			description: 'Wizard description',
			text: 'Wizard instructions'
		});
	});
});
