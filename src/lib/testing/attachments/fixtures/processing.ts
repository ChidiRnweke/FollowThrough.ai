import { InMemoryRetrievalProvider } from '$lib/testing/knowledge-search/fakes/in-memory-retrieval-provider';
import { InMemoryAttachmentExtraction } from '../fakes/extraction';
import { AgentModelSelectionService } from '$lib/services/agent/model-selection';
import { createTestContentIndex as createContentIndex } from '$lib/testing/knowledge-search/fixtures/content-index';
import {
	AttachmentUploadService,
	AttachmentReadingService,
	AttachmentLifecycleService
} from '$lib/server/services/attachments/library';
import { AttachmentFormatService } from '$lib/server/services/attachments/formats';
import { AttachmentProcessingService } from '$lib/server/services/attachments/content';
import {
	AttachmentClaimService,
	AttachmentVersionService
} from '$lib/server/services/attachments/records';
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
	const notes = new InMemoryNoteRepository(testActor());
	const search = new InMemorySearchRepository(testActor());
	const claims = new InMemoryAttachmentClaims();
	const extraction = new InMemoryAttachmentExtraction();
	const storage = new InMemoryStorage();
	const uploads = new AttachmentUploadService(testActor(), repository, notes);
	const reader = new AttachmentReadingService(repository);
	const lifecycle = new AttachmentLifecycleService(repository, notes);
	const worker = new AttachmentProcessing({
		modelSelection: new AgentModelSelectionService(),
		records: new AttachmentVersionService(repository),
		claims: new AttachmentClaimService(claims),
		extraction,
		storage,
		processing: new AttachmentProcessingService(),
		formats: new AttachmentFormatService(),
		preferences: {
			get: async () => ({
				userId: testActor().userId,
				executionMode: 'approval_required',
				inlineSuggestionsEnabled: true,
				createdAt: testNow,
				updatedAt: testNow
			})
		},
		indexer: createContentIndex(search, new InMemoryRetrievalProvider().model, chunker),
		transactionRunner: new InMemoryTransactionRunner([repository, search]),
		visionModel: process.env.OPENROUTER_ATTACHMENT_VISION_MODEL ?? 'google/gemini-2.5-flash-lite'
	});
	return {
		uploads,
		reader,
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
			const result = await worker.process(view.version.id);
			if (result.kind === 'failure') throw new Error(result.message);
		}
	};
};
