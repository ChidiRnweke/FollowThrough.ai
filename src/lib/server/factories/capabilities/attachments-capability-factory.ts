import { ImageDescriptionService } from '$lib/server/services/attachments/image-description';
import { TextAttachmentReader } from '$lib/server/adapters/attachments/text-reader';
import { AgentModelSelectionService } from '$lib/services/agent/model-selection';
import type { AttachmentIndexing } from '$lib/server/services/knowledge-search/indexing';
import type { ScheduledTask } from '$lib/models/maintenance';
import { UploadRetentionStore } from '$lib/server/stores/attachments/upload-retention';
import { AttachmentObjectRemoval } from '$lib/server/controllers/attachments/object-removal';
import { AttachmentProcessing } from '$lib/server/controllers/attachment-processing/controller';
import type { AttachmentRepository } from '$lib/server/repositories/attachments';
import type { AttachmentClaims } from '$lib/server/services/attachments/contracts';
import type { AtomicOperation } from '$lib/models/workspace';
import type { Database } from '$lib/server/db';
import type { NoteRepository } from '$lib/server/repositories/notes';
import { AttachmentRecords } from '$lib/server/repositories/attachments/postgres/attachments';
import type { AgentPreferenceEditor } from '$lib/server/services/agent/runs/preferences';
import { AttachmentFormatService } from '$lib/server/services/attachments/formats';
import {
	AttachmentContent,
	AttachmentProcessingService
} from '$lib/server/services/attachments/content';
import { ImageDescription } from '$lib/server/adapters/attachments/image-description';
import type { IImageDescription } from '$lib/server/controllers/attachment-processing/controller';
import {
	AttachmentUploadService,
	type AttachmentUploads,
	AttachmentReadingService,
	type AttachmentReader,
	AttachmentDownloadService,
	type AttachmentDownloads,
	AttachmentLifecycleService,
	type AttachmentLifecycle
} from '$lib/server/services/attachments/library';
import { MistralOcr } from '$lib/server/adapters/attachments/mistral-ocr';
import type { ITextRecognition } from '$lib/server/controllers/attachment-processing/controller';
import { UploadRetention } from '$lib/server/controllers/attachments/retention';
import {
	AttachmentStorage,
	type IAttachmentStorage,
	type ObjectStorageConfig
} from '$lib/server/repositories/attachments/object-storage';
import { createTelemetryCapability } from '$lib/server/factories/telemetry';
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
	readonly preferences: AgentPreferenceEditor;
	readonly indexer: AttachmentIndexing;
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
	readonly repository: AttachmentRepository;
	readonly storage: IAttachmentStorage;
	readonly uploads: AttachmentUploads;
	readonly reader: AttachmentReader;
	readonly downloads: AttachmentDownloads;
	readonly lifecycle: AttachmentLifecycle;
	readonly retention: ScheduledTask;
	readonly objectRemoval: ScheduledTask;
	readonly processing: ScheduledTask;
}

export const createAttachmentsCapability = (
	input: AttachmentsCapabilityInput
): AttachmentsCapability => {
	const { operations: operationObserver } = createTelemetryCapability();
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
		uploads: new AttachmentUploadService(repository, input.notes, storage),
		reader: new AttachmentReadingService(repository),
		downloads: new AttachmentDownloadService(repository, storage),
		lifecycle: new AttachmentLifecycleService(repository, input.notes),
		processing: new AttachmentProcessing({
			modelSelection: new AgentModelSelectionService(),
			records: repository,
			claims: input.claims,
			storage,
			textReader: new TextAttachmentReader(),
			ocr: ocrEngine,
			imageDescriber,
			content: new AttachmentContent(),
			imageInstructions: new ImageDescriptionService(),
			processing: new AttachmentProcessingService(),
			formats: new AttachmentFormatService(),
			preferences: input.preferences,
			indexer: input.indexer,
			transactionRunner: input.transactionRunner,
			visionModel: input.visionModel,
			logger: console
		}),
		objectRemoval: new AttachmentObjectRemoval(repository, storage),
		retention: new UploadRetention(repository, storage, new UploadRetentionStore(), {
			...optionalProperty('intervalMs', positiveNumberFromEnvironment('UPLOAD_SWEEP_INTERVAL_MS')),
			...optionalProperty('maxPerTick', positiveNumberFromEnvironment('UPLOAD_SWEEP_MAX_PER_TICK'))
		})
	};
};
