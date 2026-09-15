import { AttachmentProcessing } from '$lib/server/controllers/attachment-processing/controller';
import type { AttachmentClaims } from '$lib/server/services/attachments/contracts';
import type { AtomicOperation } from '$lib/models/workspace';
import type { Database } from '$lib/server/db';
import type { NoteRepository } from '$lib/server/repositories/notes';
import { AttachmentRecords } from '$lib/server/repositories/attachments/postgres/attachments';
import type { AgentPreferenceCatalog } from '$lib/server/services/agent/runs/preferences';
import { AttachmentContent } from '$lib/server/services/attachments/content';
import {
	ImageDescription,
	type IImageDescription
} from '$lib/server/services/attachments/image-description';
import { AttachmentLibrary } from '$lib/server/services/attachments/library';
import { MistralOcr, type ITextRecognition } from '$lib/server/services/attachments/mistral-ocr';
import { UploadRetention } from '$lib/server/services/attachments/retention';
import {
	AttachmentParserRegistry,
	AttachmentStorage,
	type IAttachmentStorage,
	type ObjectStorageConfig
} from '$lib/server/services/attachments/storage';
import type { ContentIndex } from '$lib/server/services/knowledge-search/indexing';
import { operationObserver } from '$lib/server/services/telemetry';
import {
	DEFAULT_MISTRAL_BASE_URL,
	DEFAULT_OCR_MODEL,
	optionalProperty,
	positiveNumberFromEnvironment
} from '$lib/server/config';

export interface AttachmentsCapabilityInput {
	readonly db: Database;
	readonly claims: AttachmentClaims;
	readonly transactionRunner: AtomicOperation;
	readonly visionModel: string;
	readonly notes: NoteRepository;
	readonly preferences: AgentPreferenceCatalog;
	readonly indexer: ContentIndex['attachments'];
	readonly openRouterApiKey: string;
	readonly openRouterBaseURL: string;
	readonly appURL: string;
	readonly mistralApiKey: string;
	readonly mistralBaseURL?: string;
	readonly ocrModel?: string;
	readonly s3?: ObjectStorageConfig;
	readonly storage?: IAttachmentStorage;
	readonly ocrEngine?: ITextRecognition;
	readonly imageDescriber?: IImageDescription;
}

export interface AttachmentsCapability {
	readonly repository: AttachmentRecords;
	readonly storage: IAttachmentStorage;
	readonly library: AttachmentLibrary;
	readonly retention: UploadRetention;
	readonly processing: AttachmentProcessing;
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
	return {
		repository,
		storage,
		library: new AttachmentLibrary(repository, input.notes, storage),
		processing: new AttachmentProcessing({
			records: repository,
			claims: input.claims,
			storage,
			parsers: new AttachmentParserRegistry(),
			ocr: ocrEngine,
			imageDescriber,
			content: new AttachmentContent(),
			parseLimit:
				positiveNumberFromEnvironment('ATTACHMENT_PARSE_MAX_BYTES') ??
				positiveNumberFromEnvironment('ATTACHMENT_MAX_BYTES') ??
				50 * 1024 * 1024,
			maxPages: positiveNumberFromEnvironment('ATTACHMENT_OCR_MAX_PAGES') ?? 100,
			preferences: input.preferences,
			indexer: input.indexer,
			transactionRunner: input.transactionRunner,
			visionModel: input.visionModel,
			logger: console
		}),
		retention: new UploadRetention(repository, storage, {
			...optionalProperty('intervalMs', positiveNumberFromEnvironment('UPLOAD_SWEEP_INTERVAL_MS')),
			...optionalProperty('maxPerTick', positiveNumberFromEnvironment('UPLOAD_SWEEP_MAX_PER_TICK'))
		})
	};
};
