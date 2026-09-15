import type { ActorContext } from '$lib/models/identity';
import type { AttachmentVersion, AttachmentView } from '$lib/models/attachments';
import type { AgentPreferences } from '$lib/models/agent';
import { resolveAttachmentVisionModel } from '$lib/models/agent';
import type { AtomicOperation, DateTime } from '$lib/models/workspace';
import type {
	DocumentImageDescription,
	ExtractedAttachmentContent
} from '$lib/models/attachments/ocr';
import { isOcrImage, isOcrSupported } from '$lib/server/services/attachments/formats';
import type { AttachmentContent } from '$lib/server/services/attachments/content';
import type { ITextRecognition } from '$lib/server/services/attachments/mistral-ocr';
import type { IImageDescription } from '$lib/server/services/attachments/image-description';
import type {
	IAttachmentStorage,
	AttachmentParserRegistry
} from '$lib/server/services/attachments/storage';
import type {
	AttachmentClaims,
	AttachmentClaim,
	AttachmentRepository
} from '$lib/server/services/attachments/contracts';

interface AttachmentProcessingDependencies {
	records: Pick<
		AttachmentRepository,
		'listPendingVersions' | 'findVersionForUpdate' | 'updateVersion'
	>;
	claims: AttachmentClaims;
	storage: IAttachmentStorage;
	parsers: Pick<AttachmentParserRegistry, 'select'>;
	ocr: ITextRecognition;
	imageDescriber: IImageDescription;
	content: Pick<AttachmentContent, 'plan' | 'render'>;
	parseLimit: number;
	maxPages: number;
	preferences: { get(actor: ActorContext): Promise<AgentPreferences> };
	indexer: {
		index(
			actor: ActorContext,
			attachment: AttachmentView['attachment'],
			text: string
		): Promise<{ truncated: boolean }>;
	};
	transactionRunner: AtomicOperation;
	visionModel: string;
	logger: Pick<Console, 'error'>;
}
const pending = (version: AttachmentVersion) =>
	version.processingStatus === 'queued' || version.processingStatus === 'processing';
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
					if (!current || !pending(current.version)) return undefined;
					await this.dependencies.records.updateVersion(actor, {
						...current.version,
						processingStatus: 'processing'
					});
					return current;
				});
				if (!view) return;
				const result = await this.extract(actor, view);
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
			const model = resolveAttachmentVisionModel(
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
		const { parseLimit, storage, parsers } = this.dependencies;
		const parser = parsers.select(mediaType, path);
		if (parser && byteSize <= parseLimit) {
			const bytes = await storage.read(objectKey, parseLimit);
			return { text: (await parser.parse(bytes)).slice(0, parseLimit), parserKind: parser.kind };
		}
		if (!isOcrSupported(mediaType, path)) return undefined;
		const image = isOcrImage(mediaType, path);
		const documentUrl = await storage.createDownloadUrl(objectKey, 900);
		const content = await this.dependencies.ocr.ocr({
			documentUrl,
			kind: image ? 'image' : 'document',
			fileName: path,
			maxPages: this.dependencies.maxPages
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
		parts: Parameters<AttachmentContent['plan']>[0],
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
	private async describeImage(
		input: Parameters<IImageDescription['describe']>[0]
	): Promise<DocumentImageDescription> {
		try {
			return { kind: 'described', text: await this.dependencies.imageDescriber.describe(input) };
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
			if (!current || !pending(current.version)) return;
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
			const index =
				current.attachment.currentVersionId === current.version.id
					? await this.dependencies.indexer.index(actor, current.attachment, extraction?.text ?? '')
					: { truncated: false };
			await this.dependencies.records.updateVersion(actor, {
				...current.version,
				parserKind: extraction?.parserKind,
				extractedText: extraction?.text,
				processingStatus: !extraction
					? 'unsupported'
					: extraction.processingFailure || index.truncated
						? 'partial'
						: 'ready',
				processingFailure: extraction?.processingFailure,
				processedAt: now()
			});
		});
	}
}
