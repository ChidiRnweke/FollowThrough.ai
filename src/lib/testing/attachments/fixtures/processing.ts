import { AttachmentLibrary } from '$lib/server/services/attachments/library';
import { AttachmentContent } from '$lib/server/services/attachments/content';
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
	InMemoryOcrEngine,
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
	const ocr = new InMemoryOcrEngine();
	const describer = new InMemoryImageDescriber();
	const storage = new InMemoryStorage();
	const service = new AttachmentLibrary(repository, notes, storage);
	const worker = new AttachmentProcessing({
		records: repository,
		claims,
		storage,
		parsers: new AttachmentParserRegistry([textParser]),
		ocr,
		imageDescriber: describer,
		content: new AttachmentContent(),
		parseLimit: Number(
			process.env.ATTACHMENT_PARSE_MAX_BYTES ?? process.env.ATTACHMENT_MAX_BYTES ?? 50 * 1024 * 1024
		),
		maxPages: Number(process.env.ATTACHMENT_OCR_MAX_PAGES ?? 100),
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
