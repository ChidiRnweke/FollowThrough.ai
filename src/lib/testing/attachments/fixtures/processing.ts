import { InMemoryRetrievalProvider } from '$lib/testing/knowledge-search/fakes/in-memory-retrieval-provider';
import { InMemoryAttachmentExtraction } from '../fakes/extraction';
import { AgentModelSelectionService } from '$lib/services/agent/model-selection';
import { createTestContentIndex as createContentIndex } from '$lib/testing/knowledge-search/fixtures/content-index';
import {
	AttachmentUploadService,
	AttachmentReadingService,
	AttachmentDownloadService,
	AttachmentLifecycleService
} from '$lib/server/services/attachments/library';
import { AttachmentFormatService } from '$lib/server/services/attachments/formats';
import { AttachmentProcessingService } from '$lib/server/services/attachments/content';
import { AttachmentProcessing } from '$lib/server/controllers/attachment-processing/controller';
import { InMemorySearchRepository } from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { InMemoryNoteRepository } from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { testActor, testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { InMemoryAttachmentRepository, InMemoryStorage } from '../fakes/processing';
import { InMemoryAttachmentClaims } from '../fakes/claims';
import type { AttachmentView } from '$lib/models/attachments';
export const setupAttachments = (chunker = { targetTokens: 2400, overlapTokens: 480 }) => {
	const repository = new InMemoryAttachmentRepository();
	const notes = new InMemoryNoteRepository();
	const search = new InMemorySearchRepository();
	const claims = new InMemoryAttachmentClaims();
	const extraction = new InMemoryAttachmentExtraction();
	const storage = new InMemoryStorage();
	const uploads = new AttachmentUploadService(repository, notes, storage);
	const reader = new AttachmentReadingService(repository);
	const downloads = new AttachmentDownloadService(repository, storage);
	const lifecycle = new AttachmentLifecycleService(repository, notes);
	const worker = new AttachmentProcessing({
		modelSelection: new AgentModelSelectionService(),
		records: repository,
		claims,
		extraction,
		processing: new AttachmentProcessingService(),
		formats: new AttachmentFormatService(),
		preferences: {
			get: async (actor) => ({
				userId: actor.userId,
				executionMode: 'approval_required',
				inlineSuggestionsEnabled: true,
				createdAt: testNow,
				updatedAt: testNow
			})
		},
		indexer: createContentIndex(search, new InMemoryRetrievalProvider().model, chunker),
		transactionRunner: new InMemoryTransactionRunner([repository, search]),
		visionModel: process.env.OPENROUTER_ATTACHMENT_VISION_MODEL ?? 'google/gemini-2.5-flash-lite',
		logger: { error: () => {} }
	});
	return {
		uploads,
		reader,
		downloads,
		lifecycle,
		repository,
		notes,
		search,
		claims,
		worker,
		extraction,
		storage,
		process: async (view: AttachmentView) => {
			repository.found = view;
			const result = await worker.process(testActor(), view.version.id);
			if (result.kind === 'failure') throw new Error(result.message);
		}
	};
};
