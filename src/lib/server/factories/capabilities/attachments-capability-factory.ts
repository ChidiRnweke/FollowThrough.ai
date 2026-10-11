import { AttachmentExtraction } from '$lib/server/services/attachments/extraction';
import { AgentModelSelectionService } from '$lib/services/agent/model-selection';
import type { AttachmentIndexing } from '$lib/server/services/knowledge-search/retrieval';
import type { ScheduledTask } from '$lib/models/maintenance';
import { MaintenanceProgressService } from '$lib/server/services/maintenance/progress';
import { MaintenanceCursorRecords } from '$lib/server/repositories/maintenance/postgres/cursors';
import { AttachmentObjectRemoval } from '$lib/server/controllers/attachments/object-removal';
import { AttachmentProcessing } from '$lib/server/controllers/attachment-processing/controller';
import type { AttachmentRepository } from '$lib/server/repositories/attachments';
import type { AttachmentClaims } from '$lib/server/repositories/attachments/claims';
import {
	AttachmentCleanupService,
	AttachmentClaimService,
	AttachmentVersionService
} from '$lib/server/services/attachments/records';
import type { AtomicOperation } from '$lib/models/workspace';
import type { Database } from '$lib/server/db';
import type { NoteRepository } from '$lib/server/repositories/notes';
import { AttachmentRecords } from '$lib/server/repositories/attachments/postgres/attachments';
import type { AgentPreferenceEditor } from '$lib/server/services/agent/runs/preferences';
import { AttachmentFormatService } from '$lib/server/services/attachments/formats';
import { AttachmentProcessingService } from '$lib/server/services/attachments/content';
import {
	AttachmentUploadService,
	type AttachmentUploads,
	AttachmentReadingService,
	type AttachmentReader,
	AttachmentLifecycleService,
	type AttachmentLifecycle
} from '$lib/server/services/attachments/library';
import { UploadRetention } from '$lib/server/controllers/attachments/retention';
import {
	AttachmentStorage,
	type IAttachmentStorage,
	type ObjectStorageConfig
} from '$lib/server/services/attachments/object-storage';
import { operationObserver } from '$lib/server/infrastructure/telemetry/tracing';
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
}

export interface AttachmentsCapability {
	readonly repository: AttachmentRepository;
	readonly storage: IAttachmentStorage;
	readonly uploads: AttachmentUploads;
	readonly reader: AttachmentReader;
	readonly lifecycle: AttachmentLifecycle;
	readonly retention: ScheduledTask;
	readonly objectRemoval: ScheduledTask;
	readonly processing: ScheduledTask;
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
	const cleanup = new AttachmentCleanupService(repository);
	const extraction = new AttachmentExtraction({
		ocr: {
			url: `${input.mistralBaseURL ?? DEFAULT_MISTRAL_BASE_URL}/ocr`,
			model: input.ocrModel ?? DEFAULT_OCR_MODEL,
			headers: { authorization: `Bearer ${input.mistralApiKey}` },
			fetch: globalThis.fetch
		},
		vision: {
			url: `${input.openRouterBaseURL}/chat/completions`,
			headers: { authorization: `Bearer ${input.openRouterApiKey}` },
			fetch: globalThis.fetch
		},
		observer: operationObserver,
		logger: console
	});
	return {
		repository,
		storage,
		uploads: new AttachmentUploadService(repository, input.notes),
		reader: new AttachmentReadingService(repository),
		lifecycle: new AttachmentLifecycleService(repository, input.notes),
		processing: new AttachmentProcessing({
			modelSelection: new AgentModelSelectionService(),
			records: new AttachmentVersionService(repository),
			claims: new AttachmentClaimService(input.claims),
			extraction,
			storage,
			processing: new AttachmentProcessingService(),
			formats: new AttachmentFormatService(),
			preferences: input.preferences,
			indexer: input.indexer,
			transactionRunner: input.transactionRunner,
			visionModel: input.visionModel,
			logger: console
		}),
		objectRemoval: new AttachmentObjectRemoval(cleanup, storage),
		retention: new UploadRetention(
			cleanup,
			storage,
			new MaintenanceProgressService(new MaintenanceCursorRecords(input.db)),
			{
				...optionalProperty(
					'intervalMs',
					positiveNumberFromEnvironment('UPLOAD_SWEEP_INTERVAL_MS')
				),
				...optionalProperty(
					'maxPerTick',
					positiveNumberFromEnvironment('UPLOAD_SWEEP_MAX_PER_TICK')
				)
			}
		)
	};
};
