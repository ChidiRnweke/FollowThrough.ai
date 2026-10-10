import { ImageDescriptionService } from '$lib/server/services/attachments/image-description';
import { AgentModelSelectionService } from '$lib/services/agent/model-selection';
import { createTestContentIndex as createContentIndex } from '$lib/testing/knowledge-search/fixtures/content-index';
import {
	AttachmentUploadService,
	AttachmentReadingService,
	AttachmentDownloadService,
	AttachmentLifecycleService
} from '$lib/server/services/attachments/library';
import { AttachmentFormatService } from '$lib/server/services/attachments/formats';
import {
	AttachmentContent,
	AttachmentProcessingService
} from '$lib/server/services/attachments/content';
import { AttachmentProcessing } from '$lib/server/controllers/attachment-processing/controller';
import {
	InMemorySearchRepository,
	InMemoryEmbeddingClient
} from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { InMemoryNoteRepository } from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { testActor, testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import {
	InMemoryAttachmentRepository,
	InMemoryTextParser,
	InMemoryOcrEngine,
	InMemoryImageDescriber,
	InMemoryStorage
} from '../fakes/processing';
import { InMemoryAttachmentClaims } from '../fakes/claims';
import type { AttachmentView } from '$lib/models/attachments';
export const setupAttachments = (chunker = { targetTokens: 2400, overlapTokens: 480 }) => {
	const repository = new InMemoryAttachmentRepository();
	const notes = new InMemoryNoteRepository();
	const search = new InMemorySearchRepository();
	const claims = new InMemoryAttachmentClaims();
	const textParser = new InMemoryTextParser();
	const ocr = new InMemoryOcrEngine();
	const describer = new InMemoryImageDescriber();
	const storage = new InMemoryStorage();
	const uploads = new AttachmentUploadService(repository, notes, storage);
	const reader = new AttachmentReadingService(repository);
	const downloads = new AttachmentDownloadService(repository, storage);
	const lifecycle = new AttachmentLifecycleService(repository, notes);
	const worker = new AttachmentProcessing({
		modelSelection: new AgentModelSelectionService(),
		records: repository,
		claims,
		storage,
		textReader: textParser,
		ocr,
		imageDescriber: describer,
		content: new AttachmentContent(),
		imageInstructions: new ImageDescriptionService(),
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
		indexer: createContentIndex(search, new InMemoryEmbeddingClient().model, chunker).attachments,
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
		textParser,
		ocr,
		describer,
		storage,
		process: async (view: AttachmentView) => {
			repository.found = view;
			const result = await worker.process(testActor(), view.version.id);
			if (result.kind === 'failure') throw new Error(result.message);
		}
	};
};
