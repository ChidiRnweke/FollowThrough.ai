import type { AttachmentIndexing } from '$lib/server/services/knowledge-search/retrieval';
import type { IAgentModelSelectionService } from '$lib/services/agent/model-selection';

import type { ActorContext } from '$lib/models/identity';
import type { AttachmentVersion, AttachmentView } from '$lib/models/attachments';
import type { AgentPreferences } from '$lib/models/agent';

import type { AtomicOperation, DateTime } from '$lib/models/workspace';
import type { ExtractedAttachmentContent } from '$lib/models/attachments/ocr';
import type { AttachmentFormats } from '$lib/server/services/attachments/formats';
import type { AttachmentProcessingRules } from '$lib/server/services/attachments/content';
import type { AttachmentContentExtraction } from '$lib/server/services/attachments/extraction';
import type {
	AttachmentClaims,
	AttachmentClaim,
	AttachmentRepository
} from '$lib/server/services/attachments/contracts';

interface AttachmentProcessingDependencies {
	readonly modelSelection: IAgentModelSelectionService;
	records: Pick<
		AttachmentRepository,
		'listPendingVersions' | 'findVersionForUpdate' | 'updateVersion'
	>;
	claims: AttachmentClaims;
	extraction: AttachmentContentExtraction;
	processing: AttachmentProcessingRules;
	formats: AttachmentFormats;
	preferences: { get(actor: ActorContext): Promise<AgentPreferences> };
	indexer: Pick<AttachmentIndexing, 'indexAttachment'>;
	transactionRunner: AtomicOperation;
	visionModel: string;
	logger: Pick<Console, 'error'>;
}
const now = () => new Date().toISOString() as DateTime;

/** Queued and interrupted versions are the durable processing backlog. */
export class AttachmentProcessing {
	readonly name = 'attachment-processing';
	constructor(
		private readonly dependencies: AttachmentProcessingDependencies,
		readonly intervalMs = 1000
	) {}
	async run(): Promise<void> {
		for (const item of await this.dependencies.records.listPendingVersions()) {
			const result = await this.process(item, item.versionId);
			if (result.kind === 'failure')
				this.dependencies.logger.error('Attachment processing failed', result.message);
		}
	}
	async process(
		actor: ActorContext,
		versionId: AttachmentVersion['id']
	): Promise<
		{ kind: 'claimed'; value: void } | { kind: 'busy' } | { kind: 'failure'; message: string }
	> {
		try {
			return await this.dependencies.claims.withClaim(versionId, async (claim) => {
				const view = await this.dependencies.transactionRunner.run(async () => {
					await claim.assertOwned();
					const current = await this.dependencies.records.findVersionForUpdate(actor, versionId);
					if (!current || !this.dependencies.processing.pending(current.version)) return undefined;
					if (!this.dependencies.processing.saved(current.version))
						await this.dependencies.records.updateVersion(actor, {
							...current.version,
							processingStatus: 'processing'
						});
					return current;
				});
				if (!view) return;
				const saved = this.dependencies.processing.saved(view.version);
				const result = saved
					? { kind: 'extracted' as const, extraction: saved }
					: await this.extract(actor, view);
				await this.complete(actor, view, claim, result);
			});
		} catch (error) {
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : 'Attachment processing failed'
			};
		}
	}
	private async extract(
		actor: ActorContext,
		view: AttachmentView
	): Promise<
		| { kind: 'extracted'; extraction: ExtractedAttachmentContent | undefined }
		| { kind: 'failure'; message: string }
	> {
		try {
			const model = this.dependencies.modelSelection.resolveAttachmentVisionModel(
				await this.dependencies.preferences.get(actor),
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
		return this.dependencies.extraction.extract({ objectKey, byteSize, path, kind }, model);
	}
	private async complete(
		actor: ActorContext,
		view: AttachmentView,
		claim: AttachmentClaim,
		result: Awaited<ReturnType<AttachmentProcessing['extract']>>
	) {
		await this.dependencies.transactionRunner.run(async () => {
			await claim.assertOwned();
			const current = await this.dependencies.records.findVersionForUpdate(actor, view.version.id);
			if (!current || !this.dependencies.processing.pending(current.version)) return;
			if (result.kind === 'failure') {
				await this.dependencies.records.updateVersion(actor, {
					...current.version,
					processingStatus: 'failed',
					processingFailure: result.message,
					processedAt: now()
				});
				return;
			}
			const extraction = result.extraction;
			if (current.attachment.currentVersionId === current.version.id)
				await this.dependencies.indexer.indexAttachment(
					actor,
					current.attachment,
					extraction?.text ?? ''
				);
			await this.dependencies.records.updateVersion(
				actor,
				this.dependencies.processing.complete(current.version, extraction, now())
			);
		});
	}
}
