import type { AttachmentIndexing } from '$lib/server/services/knowledge-search/indexing';
import type { IAgentModelSelectionService } from '$lib/services/agent/model-selection';

import type { ActorContext } from '$lib/models/identity';
import type { AttachmentVersion, AttachmentView } from '$lib/models/attachments';
import type { AgentPreferences } from '$lib/models/agent';

import type { AtomicOperation, DateTime } from '$lib/models/workspace';
import type {
	RecognizedPage,
	DocumentImageDescription,
	ExtractedAttachmentContent
} from '$lib/models/attachments/ocr';
import type { AttachmentFormats } from '$lib/server/services/attachments/formats';
import type {
	AttachmentContentPresentation,
	AttachmentProcessingRules
} from '$lib/server/services/attachments/content';
export interface OcrRequest {
	/** Presigned URL Mistral fetches the document from; must be publicly reachable. */
	readonly documentUrl: string;
	readonly kind: 'document' | 'image';
	readonly fileName: string;
	readonly signal?: AbortSignal;
}

export interface ITextRecognition {
	ocr(input: OcrRequest): Promise<RecognizedPage>;
}

import type { ImageDescriptionInstructions } from '$lib/server/services/attachments/image-description';
export interface IImageDescription {
	describe(input: { imageDataUrl: string; prompt: string; model: string }): Promise<string>;
}
import type {
	AttachmentClaims,
	AttachmentClaim,
	AttachmentRepository
} from '$lib/server/services/attachments/contracts';

export interface AttachmentProcessingStorage {
	read(objectKey: string, maximumBytes: number): Promise<Uint8Array>;
	createDownloadUrl(objectKey: string, expiresInSeconds: number): Promise<string>;
}
export interface AttachmentTextReader {
	readonly kind: string;
	parse(bytes: Uint8Array): Promise<string>;
}
interface AttachmentProcessingDependencies {
	readonly modelSelection: IAgentModelSelectionService;
	records: Pick<
		AttachmentRepository,
		'listPendingVersions' | 'findVersionForUpdate' | 'updateVersion'
	>;
	claims: AttachmentClaims;
	storage: AttachmentProcessingStorage;
	textReader: AttachmentTextReader;
	ocr: ITextRecognition;
	imageDescriber: IImageDescription;
	imageInstructions: ImageDescriptionInstructions;
	content: AttachmentContentPresentation;
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
		const { storage, textReader } = this.dependencies;
		if (this.dependencies.formats.text(mediaType, path)) {
			const bytes = await storage.read(objectKey, byteSize);
			return { text: await textReader.parse(bytes), parserKind: textReader.kind };
		}
		const kind = this.dependencies.formats.ocrKind(mediaType, path);
		if (!kind) return undefined;
		const image = kind === 'image';
		const documentUrl = await storage.createDownloadUrl(objectKey, 900);
		const content = await this.dependencies.ocr.ocr({
			documentUrl,
			kind,
			fileName: path
		});
		const text = await this.describeDocument(content.parts, model);
		if (!image) return { text, parserKind: 'ocr' };
		const description = await this.describeStoredImage(objectKey, model);
		return description.kind === 'failure'
			? { text: text.trim(), parserKind: 'ocr', processingFailure: description.message }
			: {
					text: [text.trim(), `> **Image:** ${description.text}`].filter(Boolean).join('\n\n'),
					parserKind: 'ocr'
				};
	}
	private async describeDocument(
		parts: Parameters<AttachmentContentPresentation['plan']>[0],
		model: string
	): Promise<string> {
		const slots = this.dependencies.content.plan(parts);
		const images = slots.filter((slot) => slot.kind === 'image');
		const descriptions = new Map<number, DocumentImageDescription>();
		let next = 0;
		const worker = async () => {
			while (next < images.length) {
				const image = images[next++];
				const result = await this.describeImage({
					imageDataUrl: image.imageDataUrl,
					model,
					...(image.context ? { context: image.context } : {})
				});
				descriptions.set(image.index, result);
			}
		};
		// Preserve the existing four-request concurrency bound and document reading order.
		await Promise.all(Array.from({ length: Math.min(4, images.length) }, worker));
		return this.dependencies.content.render(slots, descriptions);
	}
	private async describeStoredImage(
		objectKey: string,
		model: string
	): Promise<DocumentImageDescription> {
		try {
			const imageDataUrl = await this.dependencies.storage.createDownloadUrl(objectKey, 300);
			return await this.describeImage({ imageDataUrl, model });
		} catch (error) {
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : 'Image description failed'
			};
		}
	}
	private async describeImage(input: {
		imageDataUrl: string;
		context?: string;
		model: string;
	}): Promise<DocumentImageDescription> {
		try {
			return {
				kind: 'described',
				text: await this.dependencies.imageDescriber.describe({
					imageDataUrl: input.imageDataUrl,
					model: input.model,
					prompt: this.dependencies.imageInstructions.prepare(input)
				})
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Image description failed';
			this.dependencies.logger.error('Image description failed', message);
			return { kind: 'failure', message };
		}
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
