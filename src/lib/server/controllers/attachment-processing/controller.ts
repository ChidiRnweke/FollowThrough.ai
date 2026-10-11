import type { AttachmentIndexing } from '$lib/server/services/knowledge-search/retrieval';
import type { IAgentModelSelectionService } from '$lib/services/agent/model-selection';

import type { AttachmentVersion, AttachmentView } from '$lib/models/attachments';
import type { AgentPreferences } from '$lib/models/agent';

import type { AtomicOperation, DateTime } from '$lib/models/workspace';
import type { ExtractedAttachmentContent } from '$lib/models/attachments/ocr';
import type { AttachmentFormats } from '$lib/server/services/attachments/formats';
import type { AttachmentProcessingRules } from '$lib/server/services/attachments/content';
import type { AttachmentContentExtraction } from '$lib/server/services/attachments/extraction';
import type { IAttachmentStorage } from '$lib/server/services/attachments/object-storage';
import type { AttachmentExtractionSource } from '$lib/models/attachments/ocr';
import type {
	AttachmentClaim,
	AttachmentProcessingClaims,
	AttachmentVersions
} from '$lib/server/services/attachments/records';

interface AttachmentProcessingDependencies {
	/** The process clock, shared by every capability that stamps time. */
	readonly now: () => DateTime;
	readonly modelSelection: IAgentModelSelectionService;
	records: AttachmentVersions;
	claims: AttachmentProcessingClaims;
	extraction: AttachmentContentExtraction;
	storage: Pick<IAttachmentStorage, 'read' | 'createDownloadUrl'>;
	processing: AttachmentProcessingRules;
	formats: AttachmentFormats;
	preferences: { get(): Promise<AgentPreferences> };
	indexer: Pick<AttachmentIndexing, 'indexAttachment'>;
	transactionRunner: AtomicOperation;
	visionModel: string;
}
/** Extracts and indexes one of the user's attachment versions. */
export interface AttachmentProcessingController {
	process(
		versionId: AttachmentVersion['id']
	): Promise<
		{ kind: 'claimed'; value: void } | { kind: 'busy' } | { kind: 'failure'; message: string }
	>;
}
export class AttachmentProcessing implements AttachmentProcessingController {
	constructor(private readonly dependencies: AttachmentProcessingDependencies) {}
	async process(
		versionId: AttachmentVersion['id']
	): Promise<
		{ kind: 'claimed'; value: void } | { kind: 'busy' } | { kind: 'failure'; message: string }
	> {
		try {
			return await this.dependencies.claims.withClaim(versionId, async (claim) => {
				const view = await this.dependencies.transactionRunner.run(async () => {
					await claim.assertOwned();
					const current = await this.dependencies.records.findVersionForUpdate(versionId);
					if (!current || !this.dependencies.processing.pending(current.version)) return undefined;
					if (!this.dependencies.processing.saved(current.version))
						await this.dependencies.records.updateVersion({
							...current.version,
							processingStatus: 'processing'
						});
					return current;
				});
				if (!view) return;
				const saved = this.dependencies.processing.saved(view.version);
				const result = saved
					? { kind: 'extracted' as const, extraction: saved }
					: await this.extract(view);
				await this.complete(view, claim, result);
			});
		} catch (error) {
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : 'Attachment processing failed'
			};
		}
	}
	private async extract(
		view: AttachmentView
	): Promise<
		| { kind: 'extracted'; extraction: ExtractedAttachmentContent | undefined }
		| { kind: 'failure'; message: string }
	> {
		try {
			const model = this.dependencies.modelSelection.resolveAttachmentVisionModel(
				await this.dependencies.preferences.get(),
				this.dependencies.visionModel
			);
			const extraction = await this.extractContent(view, model);
			return { kind: 'extracted', extraction };
		} catch (error) {
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : 'Processing failed'
			};
		}
	}
	private async extractContent(
		view: AttachmentView,
		model: string
	): Promise<ExtractedAttachmentContent | undefined> {
		const { mediaType, byteSize, objectKey } = view.version;
		const path = view.attachment.path;
		const kind = this.dependencies.formats.text(mediaType, path)
			? 'text'
			: this.dependencies.formats.ocrKind(mediaType, path);
		if (!kind) return undefined;
		const source: AttachmentExtractionSource =
			kind === 'text'
				? { kind, bytes: await this.dependencies.storage.read(objectKey, byteSize) }
				: // The OCR and vision providers read the object through this link while they work.
					{ kind, path, url: await this.dependencies.storage.createDownloadUrl(objectKey, 900) };
		return this.dependencies.extraction.extract(source, model);
	}
	private async complete(
		view: AttachmentView,
		claim: AttachmentClaim,
		result: Awaited<ReturnType<AttachmentProcessing['extract']>>
	) {
		await this.dependencies.transactionRunner.run(async () => {
			await claim.assertOwned();
			const current = await this.dependencies.records.findVersionForUpdate(view.version.id);
			if (!current || !this.dependencies.processing.pending(current.version)) return;
			if (result.kind === 'failure') {
				await this.dependencies.records.updateVersion({
					...current.version,
					processingStatus: 'failed',
					processingFailure: result.message,
					processedAt: this.dependencies.now()
				});
				return;
			}
			const extraction = result.extraction;
			if (current.attachment.currentVersionId === current.version.id)
				await this.dependencies.indexer.indexAttachment(current.attachment, extraction?.text ?? '');
			await this.dependencies.records.updateVersion(
				this.dependencies.processing.complete(current.version, extraction, this.dependencies.now())
			);
		});
	}
}
