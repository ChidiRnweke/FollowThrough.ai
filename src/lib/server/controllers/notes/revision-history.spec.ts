import { NOTE_REVISION_HISTORY_LIMIT, noteEtag } from '$lib/models/notes';
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
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
import { TodoPresentationService } from '$lib/services/todos/presentation';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import {
	noteBuilder,
	testActor,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';
import { Notes, type NotesDependencies } from './controller';

const setup = () => {
	const content = new InMemoryNoteContent();
	const controller = new Notes(
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
			noteReader: content,
			noteEditor: content,
			noteLinkReconciler: content,
			notePublisher: content,
			revisionRecorder: content,
			revisionReader: content,
			anchorRepairer: content,
			noteIndexer: content,
			transactionRunner: new InMemoryTransactionRunner([content])
		})
	);
	return { content, controller };
};

/** Publishes `times` times, editing between each so a new revision is worth recording. */
const publishRepeatedly = async (
	content: InMemoryNoteContent,
	controller: Notes,
	times: number
): Promise<void> => {
	for (let round = 0; round < times; round += 1) {
		const current = content.notes[0]!;
		await controller.publish(testActor(), {
			noteId: current.id,
			baseEtag: noteEtag(current.id, current.currentRevision)
		});
		await controller.save(testActor(), {
			note: { ...content.notes[0]!, plainText: `Body ${round}` }
		});
	}
};

describe('Note revision history invariants', () => {
	it('lists nothing before the note has ever been published', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder()];
		const result = await controller.listRevisions(testActor(), { noteId: testNoteId() });
		expect(result.revisions).toEqual([]);
	});

	it('lists a snapshot once the note is published', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder()];
		await publishRepeatedly(content, controller, 1);
		const result = await controller.listRevisions(testActor(), { noteId: testNoteId() });
		expect(result.revisions).toHaveLength(1);

		expect(result.revisions[0]).not.toHaveProperty('document');
	});

	it('orders the history newest first', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder()];
		await publishRepeatedly(content, controller, 3);
		const result = await controller.listRevisions(testActor(), { noteId: testNoteId() });
		expect(result.revisions.map((revision) => revision.revision)).toEqual([3, 2, 1]);
	});

	it('marks the snapshot the note is currently published at', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder()];
		await publishRepeatedly(content, controller, 2);
		const result = await controller.listRevisions(testActor(), { noteId: testNoteId() });
		expect(result.revisions.filter((revision) => revision.isPublished)).toHaveLength(1);
	});

	// The whole point of snapshotting at publish rather than per keystroke is that history
	// costs a bounded amount; without the cap a long-lived note grows without limit.
	it('caps the history at the retention limit', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder()];
		await publishRepeatedly(content, controller, NOTE_REVISION_HISTORY_LIMIT + 5);
		const result = await controller.listRevisions(testActor(), { noteId: testNoteId() });
		expect(result.revisions).toHaveLength(NOTE_REVISION_HISTORY_LIMIT);

		expect(result.revisions.at(-1)?.revision).toBe(6);
	});

	it('reads one snapshot in full for the diff', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder({ plainText: 'Original' })];
		await publishRepeatedly(content, controller, 1);
		const { revisions } = await controller.listRevisions(testActor(), { noteId: testNoteId() });
		const result = await controller.getRevision(testActor(), {
			noteId: testNoteId(),
			revisionId: revisions[0]!.id
		});
		expect(result.revision.plainText).toBe('Original');
	});

	it('rejects reading a revision that has been pruned away', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder()];
		await publishRepeatedly(content, controller, 1);
		await expect(
			controller.getRevision(testActor(), {
				noteId: testNoteId(),
				revisionId: `${testNoteId()}:r999` as never
			})
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
});
