import { AttachmentLibrary } from '$lib/server/services/attachments/library';
import { AttachmentExtraction } from '$lib/server/services/attachments/extraction';
import { AttachmentParserRegistry } from '$lib/server/services/attachments/storage';
import { AttachmentProcessing } from '$lib/server/controllers/attachment-processing/controller';
import { ContentIndex } from '$lib/server/services/knowledge-search/indexing';
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
	InMemoryDocumentOcr,
	InMemoryImageDescriber,
	InMemoryStorage
} from '../fakes/processing';
import { InMemoryAttachmentClaims } from '../fakes/claims';
import type { AttachmentView } from '$lib/models/attachments';
export const setupAttachments = () => {
	const repository = new InMemoryAttachmentRepository();
	const notes = new InMemoryNoteRepository();
	const search = new InMemorySearchRepository();
	const claims = new InMemoryAttachmentClaims();
	const textParser = new InMemoryTextParser();
	const ocr = new InMemoryDocumentOcr();
	const describer = new InMemoryImageDescriber();
	const storage = new InMemoryStorage();
	const service = new AttachmentLibrary(repository, notes, storage, search);
	const worker = new AttachmentProcessing({
		records: repository,
		claims,
		extraction: new AttachmentExtraction(
			storage,
			new AttachmentParserRegistry([textParser]),
			ocr,
			describer
		),
		preferences: {
			get: async (actor) => ({
				userId: actor.userId,
				executionMode: 'approval_required',
				inlineSuggestionsEnabled: true,
				createdAt: testNow,
				updatedAt: testNow
			})
		},
		indexer: new ContentIndex(search, new InMemoryEmbeddingClient()).attachments,
		transactionRunner: new InMemoryTransactionRunner([repository, search]),
		visionModel: process.env.OPENROUTER_ATTACHMENT_VISION_MODEL ?? 'google/gemini-2.5-flash-lite',
		logger: { error: () => {} }
	});
	return {
		service,
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
