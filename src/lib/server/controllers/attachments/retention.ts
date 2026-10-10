import type { ScheduledTask } from '$lib/models/maintenance';
import type { UploadRetentionStore } from '$lib/server/stores/attachments/upload-retention';
import type { ActorContext } from '$lib/models/identity';
import type {
	AttachmentUpload,
	OwnedAttachmentUpload,
	UploadRetentionCursor
} from '$lib/models/attachments';
export interface AttachmentStorage {
	remove(objectKey: string): Promise<void>;
}
export interface UploadRetentionRepository {
	listExpiredUploads(
		cutoff: Date,
		limit: number,
		after?: UploadRetentionCursor
	): Promise<readonly OwnedAttachmentUpload[]>;
	deleteUpload(actor: ActorContext, id: AttachmentUpload['id']): Promise<void>;
}

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_MAX_PER_TICK = 500;
/**
 * Uploads live for ten minutes. Waiting an extra hour past expiry before
 * reclaiming one means a client finishing a slow transfer against a reservation
 * that just lapsed still finds its object where it left it.
 */
const DEFAULT_GRACE_MS = 60 * 60 * 1000;

export interface UploadRetentionOptions {
	readonly intervalMs?: number;
	readonly maxPerTick?: number;
	readonly graceMs?: number;
	readonly now?: () => Date;
	readonly logger?: Pick<Console, 'error' | 'log'>;
}

/**
 * Reclaims upload reservations that were never finalized.
 *
 * `attachment_uploads` rows are created when a client asks for a presigned URL
 * and deleted when it commits. Abandoned ones were previously left behind
 * forever, holding a row and an orphaned object in the bucket.
 */
export class UploadRetention implements ScheduledTask {
	readonly name = 'expired-upload-sweep';
	readonly intervalMs: number;
	private readonly maxPerTick: number;
	private readonly graceMs: number;
	private readonly now: () => Date;
	private readonly logger: Pick<Console, 'error' | 'log'>;

	constructor(
		private readonly repository: UploadRetentionRepository,
		private readonly storage: AttachmentStorage,
		private readonly state: UploadRetentionStore,
		options: UploadRetentionOptions = {}
	) {
		this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
		this.maxPerTick = options.maxPerTick ?? DEFAULT_MAX_PER_TICK;
		this.graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
		this.now = options.now ?? (() => new Date());
		this.logger = options.logger ?? console;
	}

	async run(): Promise<void> {
		// Finish a bounded pass before including newly expired rows. Persistent failures
		// cannot monopolize the first page or be starved by a stream of new uploads.
		const traversal = this.state.read();
		let cutoff = traversal?.cutoff ?? new Date(this.now().getTime() - this.graceMs);
		let expired = await this.repository.listExpiredUploads(
			cutoff,
			this.maxPerTick,
			traversal?.after
		);
		if (!expired.length && traversal) {
			this.state.update(undefined);
			cutoff = new Date(this.now().getTime() - this.graceMs);
			expired = await this.repository.listExpiredUploads(cutoff, this.maxPerTick);
		}
		if (!expired.length) return;

		let swept = 0;
		for (const entry of expired) {
			try {
				await this.reclaim(entry);
				swept += 1;
				// audit-allow: silent-catch — the scheduled batch reports this item as failed and leaves its reservation for the next tick.
			} catch (error) {
				this.logger.error(`[expired-upload-sweep] ${entry.upload.id} failed:`, error);
			}
		}
		const last = expired[expired.length - 1]!;
		this.state.update(
			expired.length === this.maxPerTick
				? { cutoff, after: { expiresAt: last.upload.expiresAt, id: last.upload.id } }
				: undefined
		);
		this.logger.log(`[expired-upload-sweep] reclaimed ${swept} of ${expired.length} upload(s)`);
	}

	private async reclaim(entry: OwnedAttachmentUpload): Promise<void> {
		const actor: ActorContext = { userId: entry.userId };
		// The object goes first: a failed delete leaves the row for the next tick to
		// retry, whereas dropping the row first would lose the only pointer to it.
		// The storage adapter treats an already-absent object as success. Any other
		// removal failure must retain the row so a later sweep can retry it.
		await this.storage.remove(entry.upload.objectKey);
		await this.repository.deleteUpload(actor, entry.upload.id);
	}
}
