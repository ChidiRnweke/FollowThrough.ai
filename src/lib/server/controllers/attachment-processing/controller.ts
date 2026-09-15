import type { ActorContext } from '$lib/models/identity';
import type { AttachmentVersion, AttachmentView } from '$lib/models/attachments';
import type { AgentPreferences } from '$lib/models/agent';
import { resolveAttachmentVisionModel } from '$lib/models/agent';
import type { AtomicOperation, DateTime } from '$lib/models/workspace';
import type {
	AttachmentClaims,
	AttachmentClaim,
	AttachmentRepository,
	AttachmentTextExtractor
} from '$lib/server/services/attachments/contracts';

interface AttachmentProcessingDependencies {
	records: Pick<
		AttachmentRepository,
		'listPendingVersions' | 'findVersionForUpdate' | 'updateVersion'
	>;
	claims: AttachmentClaims;
	extraction: AttachmentTextExtractor;
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
		| { kind: 'extracted'; extraction: Awaited<ReturnType<AttachmentTextExtractor['extract']>> }
		| { kind: 'failure'; message: string }
	> {
		try {
			const model = resolveAttachmentVisionModel(
				await this.dependencies.preferences.get(actor),
				this.dependencies.visionModel
			);
			const extraction = await this.dependencies.extraction.extract(view, model);
			return { kind: 'extracted', extraction };
		} catch (error) {
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : 'Processing failed'
			};
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
