import type { Database } from '$lib/server/db';
import type { NoteRepository } from '$lib/server/repositories/notes';
import { AttachmentRecords } from '$lib/server/repositories/attachments/postgres/attachments';
import type { AgentPreferenceCatalog } from '$lib/server/services/agent/runs/preferences';
import {
	AttachmentContent,
	type ImageDescriber,
	type OcrEngineClient
} from '$lib/server/services/attachments/content';
import type { DocumentOcr } from '$lib/server/services/attachments/contracts';
import { ImageDescription } from '$lib/server/services/attachments/image-description';
import { AttachmentLibrary } from '$lib/server/services/attachments/library';
import { MistralOcr } from '$lib/server/services/attachments/mistral-ocr';
import { UploadRetention } from '$lib/server/services/attachments/retention';
import {
	AttachmentParserRegistry,
	AttachmentStorage,
	type IAttachmentStorage,
	type ObjectStorageConfig
} from '$lib/server/services/attachments/storage';
import type { EmbeddedAttachmentIndexer } from '$lib/server/services/knowledge-search/indexing';
import type { KnowledgeIndexRecords } from '$lib/server/repositories/knowledge-search/postgres/search';
import { operationObserver } from '$lib/server/services/telemetry';
import {
	DEFAULT_MISTRAL_BASE_URL,
	DEFAULT_OCR_MODEL,
	optionalProperty,
	positiveNumberFromEnvironment
} from '$lib/server/config';

export interface AttachmentsCapabilityInput {
	readonly db: Database;
	readonly notes: NoteRepository;
	readonly preferences: AgentPreferenceCatalog;
	readonly searchRepository: KnowledgeIndexRecords;
	readonly indexer: EmbeddedAttachmentIndexer;
	readonly openRouterApiKey: string;
	readonly openRouterBaseURL: string;
	readonly appURL: string;
	readonly mistralApiKey: string;
	readonly mistralBaseURL?: string;
	readonly ocrModel?: string;
	readonly s3?: ObjectStorageConfig;
	readonly storage?: IAttachmentStorage;
	readonly ocrEngine?: OcrEngineClient;
	readonly imageDescriber?: ImageDescriber;
	readonly documentOcr?: DocumentOcr;
}

export interface AttachmentsCapability {
	readonly repository: AttachmentRecords;
	readonly storage: IAttachmentStorage;
	readonly library: AttachmentLibrary;
	readonly retention: UploadRetention;
}

export const createAttachmentsCapability = (
	input: AttachmentsCapabilityInput
): AttachmentsCapability => {
	const repository = new AttachmentRecords(input.db);
	const storage =
		input.storage ??
		new AttachmentStorage(
			input.s3 ?? {
				endpoint: 'http://localhost:9000',
				region: 'us-east-1',
				accessKeyId: 'followthrough',
				secretAccessKey: 'followthrough-local-secret',
				bucket: 'followthrough-attachments',
				forcePathStyle: true
			}
		);
	const ocrEngine =
		input.ocrEngine ??
		new MistralOcr(input.mistralApiKey, {
			baseURL: input.mistralBaseURL ?? DEFAULT_MISTRAL_BASE_URL,
			model: input.ocrModel ?? DEFAULT_OCR_MODEL,
			observer: operationObserver
		});
	const imageDescriber =
		input.imageDescriber ??
		new ImageDescription(input.openRouterApiKey, {
			baseURL: input.openRouterBaseURL,
			appURL: input.appURL
		});
	const documentOcr = input.documentOcr ?? new AttachmentContent(ocrEngine, imageDescriber);
	return {
		repository,
		storage,
		library: new AttachmentLibrary(
			repository,
			input.notes,
			storage,
			new AttachmentParserRegistry(),
			documentOcr,
			imageDescriber,
			input.searchRepository,
			input.indexer,
			input.preferences
		),
		retention: new UploadRetention(repository, storage, {
			...optionalProperty('intervalMs', positiveNumberFromEnvironment('UPLOAD_SWEEP_INTERVAL_MS')),
			...optionalProperty('maxPerTick', positiveNumberFromEnvironment('UPLOAD_SWEEP_MAX_PER_TICK'))
		})
	};
};
