import { noteEtag } from '$lib/models/notes';
import type { SkillEditInput } from '$lib/models/skills';
import { readSkillManifest } from '$lib/remote/skills/manifest-reader.server';
import { Notes, type NotesDependencies } from '$lib/server/controllers/notes/controller';
import { createNoteServices } from '$lib/server/factories/capabilities/notes-capability-factory';
import { createSkillServices } from '$lib/server/factories/capabilities/skills-capability-factory';
import { NoteArchiveImportService } from '$lib/server/services/notes/import';
import { NotePatchPreparationService } from '$lib/server/services/notes/patches';
import { NoteRevisionComparisonService } from '$lib/server/services/notes/revision-diff';
import { NoteEditingService as NoteEditingRulesService } from '$lib/services/notes/editing';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { NotePresentationService } from '$lib/services/notes/presentation';
import { NoteReferenceService } from '$lib/services/notes/references';
import { NoteSectionNumberingService } from '$lib/services/notes/section-numbering';
import { NoteTextSearchService } from '$lib/services/notes/text-search';
import { ProvenancePresentationService } from '$lib/services/provenance/presentation';
import { ReferencePresentationService } from '$lib/services/references/presentation';
import { BacklinkPresentationService } from '$lib/services/relationships/presentation';
import { SkillPortabilityService } from '$lib/services/skills/manifest';
import { SkillMetadataEditingService } from '$lib/services/skills/metadata';
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
import { TodoPresentationService } from '$lib/services/todos/presentation';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { saveNoteDraft } from '$lib/testing/notes/fixtures/saved-draft';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { InMemorySkillRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import {
	noteBuilder,
	projectBuilder,
	testActor,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';
import { Skills, type SkillsDependencies } from './controller';
const setup = () => {
	const notes = new InMemoryNoteRepository();
	const projects = new InMemoryProjectRepository();
	projects.projects = [projectBuilder()];
	const skills = new InMemorySkillRepository(notes);
	const service = createSkillServices(skills, notes, new InMemoryProvenanceRepository());
	const catalog = createNoteServices(notes, new InMemoryAnchorRepository(), projects);
	const content = new InMemoryNoteContent();
	const transactionRunner = new InMemoryTransactionRunner([notes, skills]);
	const controller = new Skills(
		new WorkspaceCommandRulesService(),
		capabilityDependencies<SkillsDependencies>({
			...agentToolResultsFixture(),
			skillPortability: new SkillPortabilityService(),
			skillMetadataEditing: new SkillMetadataEditingService(),
			noteReferences: new NoteReferenceService(),
			noteCreationRules: new NoteLifecycleRulesService(),
			noteEditingRules: new NoteEditingRulesService(),
			skillFinder: service.finder,
			skillEditor: service.editor,
			skillUsageLister: service.usageLister,
			noteEditor: catalog.editor,
			revisionReader: catalog.revisionReader,
			revisionRecorder: catalog.revisionRecorder,
			attachmentRestorer: catalog.attachmentRestorer,
			anchorRepairer: catalog.anchorRepairer,
			noteIndexer: content,
			noteLinkReconciler: content,
			transactionRunner
		})
	);
	return { controller, service, notes, skills, catalog, content, transactionRunner };
};
const importSkill = () => {
	const state = setup();
	const note = noteBuilder({ kind: 'skill', title: 'Decision writing' });
	state.notes.notes = [note];
	state.skills.skills = [
		{
			note,

			slug: 'decision-writing',
			description: 'Writes decisions',
			triggerHints: [],
			metadata: {},
			allowImplicitInvocation: true,
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
	it('clears omitted portable fields while preserving an explicit invocation policy', async () => {
		const { controller, skills, note } = importSkill();
		skills.skills[0] = {
			...skills.skills[0],
			license: 'MIT',
			compatibility: 'Node 22',
			metadata: { owner: 'author' }
		};
		const { skill } = await controller.update(testActor(), {
			noteId: note.id,
			content: {
				kind: 'manifest',
				baseRevision: 1,
				manifest: {
					slug: 'decision-writing',
					description: 'Writes decisions',
					metadata: {},
					allowImplicitInvocation: false,
					instructions: 'New instructions'
				}
			}
		});
		expect({
			license: skill.license,
			compatibility: skill.compatibility,
			metadata: skill.metadata,
			implicit: skill.allowImplicitInvocation
		}).toEqual({ license: undefined, compatibility: undefined, metadata: {}, implicit: false });
	});
	it('rejects metadata changes to an archived skill', async () => {
		const { controller, notes, note } = importSkill();
		notes.notes = [{ ...note, archivedAt: note.updatedAt }];
		await expect(
			controller.update(testActor(), { noteId: note.id, isEnabled: false })
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});
	it('normalizes description and trigger hints through the shared metadata rules', async () => {
		const { controller, note } = importSkill();
		const { skill } = await controller.update(testActor(), {
			noteId: note.id,
			description: '  Release guidance  ',
			triggerHints: [' release ', '', '  ']
		});
		expect({ description: skill.description, triggerHints: skill.triggerHints }).toEqual({
			description: 'Release guidance',
			triggerHints: ['release']
		});
	});
	it('retains the current description when disabling a skill with an empty description', async () => {
		const { controller, note } = importSkill();
		const { skill } = await controller.update(testActor(), {
			noteId: note.id,
			description: '  ',
			isEnabled: false
		});
		expect({ description: skill.description, enabled: skill.isEnabled }).toEqual({
			description: 'Writes decisions',
			enabled: false
		});
	});
	it('reads the current note title in the skill list after a document rename', async () => {
		const { catalog, service, note, transactionRunner } = importSkill();
		await saveNoteDraft(catalog.editor, transactionRunner, testActor(), {
			...note,
			title: 'Release decisions'
		});
		expect((await service.finder.listAll(testActor())).map((skill) => skill.name)).toEqual([
			'Release decisions'
		]);
	});
	it('keeps a title change unpublished and preserves the portable skill name', async () => {
		const { controller, notes, note } = importSkill();
		const { skill } = await controller.update(testActor(), {
			noteId: note.id,
			displayName: 'Release decisions'
		});
		expect({
			slug: skill.slug,
			revision: skill.note.currentRevision,
			published: skill.note.publishedRevision,
			history: notes.revisions,
			title: skill.note.title
		}).toEqual({
			slug: 'decision-writing',
			revision: 2,
			published: 0,
			history: [],
			title: 'Release decisions'
		});
	});
	it('rolls back the renamed document when its metadata write fails', async () => {
		const { controller, notes, skills, note } = importSkill();
		skills.writeFailure = new Error('Metadata write failed');
		await controller
			.update(testActor(), { noteId: note.id, displayName: 'Release decisions' })
			.then(
				() => {
					throw new Error('Expected metadata failure');
				},
				(error: Error) => {
					if (error.message !== 'Metadata write failed') throw error;
				}
			);
		expect(notes.notes).toEqual([note]);
	});
	it('rejects an empty display name', async () => {
		const { controller, note } = importSkill();
		await expect(
			controller.update(testActor(), { noteId: note.id, displayName: '  ' })
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});
	it('does not save instructions when their portable metadata is incomplete', async () => {
		const { controller, notes } = importSkill();
		const original = structuredClone(notes.notes);
		const result = await controller
			.update(testActor(), {
				noteId: input.noteId,
				description: 'x'.repeat(1025),
				content: { kind: 'instructions', text: 'Replacement body', baseRevision: 1 }
			})
			.then(
				() => ({ kind: 'saved' }),
				(error: Error) => ({ kind: 'failure', error })
			);
		expect({ result, notes: notes.notes }).toMatchObject({
			result: { kind: 'failure', error: { code: 'VALIDATION' } },
			notes: original
		});
	});
	it('rejects an imported portable name already used by another skill', async () => {
		const { controller, skills, notes } = importSkill();
		const other = noteBuilder({ id: testNoteId(2), kind: 'skill', title: 'Another skill' });
		notes.notes.push(other);
		skills.skills.push({
			note: other,
			slug: 'already-used',
			description: 'Existing instructions',
			triggerHints: [],
			metadata: {},
			allowImplicitInvocation: true,
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
		const { controller, notes, content } = importSkill();
		const result = await controller.update(testActor(), input);
		expect({
			text: result.skill.note.plainText,
			revision: result.skill.note.currentRevision,
			published: result.skill.note.publishedRevision,
			snapshots: notes.revisions.length,
			indexed: content.indexedNoteIds
		}).toEqual({
			text: 'Write a decision and explain its consequences.',
			revision: 2,
			published: 0,
			snapshots: 0,
			indexed: [testNoteId()]
		});
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
		const { controller, catalog, notes, transactionRunner } = importSkill();
		const result = await controller.update(testActor(), input);
		const publisher = new Notes(
			new BacklinkPresentationService(),
			new ReferencePresentationService(),
			new WorkspaceCommandRulesService(),
			new ProvenancePresentationService(),
			capabilityDependencies<NotesDependencies>({
				...agentToolResultsFixture(),
				archiveImport: new NoteArchiveImportService(),
				patchPreparation: new NotePatchPreparationService(),
				revisionComparison: new NoteRevisionComparisonService(),
				todoPresentation: new TodoPresentationService(),
				textSearch: new NoteTextSearchService(),
				noteReferences: new NoteReferenceService(),
				sections: new NoteSectionNumberingService(),
				noteCreationRules: new NoteLifecycleRulesService(),
				noteTrashRules: new NoteLifecycleRulesService(),
				notePublicationRules: new NoteLifecycleRulesService(),
				noteEditingRules: new NoteEditingRulesService(),
				notePresentation: new NotePresentationService(),
				suggestionPresentation: new SuggestionPresentationService(),
				transactionRunner,
				notePublisher: catalog.publisher,
				revisionRecorder: catalog.revisionRecorder
			})
		);
		await publisher.publish(testActor(), {
			noteId: result.skill.note.id,
			baseEtag: noteEtag(result.skill.note.id, result.skill.note.currentRevision)
		});
		expect(notes.revisions.map((snapshot) => snapshot.plainText)).toEqual([
			'Write a decision and explain its consequences.'
		]);
	});
	it('refuses imported content based on an older editor revision', async () => {
		const { controller, catalog, note, transactionRunner } = importSkill();
		await saveNoteDraft(catalog.editor, transactionRunner, testActor(), {
			...note,
			plainText: 'A newer edit'
		});
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

it('refuses an oversized metadata-only description without replacing the existing one', async () => {
	const { controller, note, skills } = importSkill();
	const result = await controller
		.update(testActor(), { noteId: note.id, description: 'x'.repeat(1025) })
		.then(
			() => 'saved',
			() => 'failed'
		);
	expect({ result, description: skills.skills[0].description }).toEqual({
		result: 'failed',
		description: 'Writes decisions'
	});
});
