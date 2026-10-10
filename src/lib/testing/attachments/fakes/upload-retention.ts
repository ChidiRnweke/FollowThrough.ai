import type { AttachmentUpload } from '$lib/models/attachments';
import type { UserId } from '$lib/models/identity';
import type {
	OwnedAttachmentUpload,
	UploadRetentionCursor
} from '$lib/server/repositories/attachments/attachments';
import type {
	AttachmentStorage,
	UploadRetentionRepository
} from '$lib/server/controllers/attachments/retention';

export class InMemoryUploadReservations implements UploadRetentionRepository {
	deleted: string[] = [];
	cutoffs: Date[] = [];
	deleteFailures = new Set<AttachmentUpload['id']>();

	constructor(public rows: OwnedAttachmentUpload[] = []) {}

	async listExpiredUploads(
		before: Date,
		limit: number,
		after?: UploadRetentionCursor
	): Promise<readonly OwnedAttachmentUpload[]> {
		this.cutoffs.push(before);
		return this.rows
			.filter(
				({ upload }) =>
					new Date(upload.expiresAt) < before &&
					(!after ||
						upload.expiresAt > after.expiresAt ||
						(upload.expiresAt === after.expiresAt && upload.id > after.id))
			)
			.sort(
				(a, b) =>
					a.upload.expiresAt.localeCompare(b.upload.expiresAt) ||
					a.upload.id.localeCompare(b.upload.id)
			)
			.slice(0, limit);
	}

	async deleteUpload(actor: { userId: UserId }, id: AttachmentUpload['id']): Promise<void> {
		if (this.deleteFailures.has(id)) throw new Error('Reservation deletion failed');
		if (this.rows.some((row) => row.userId === actor.userId && row.upload.id === id))
			this.deleted.push(id);
		this.rows = this.rows.filter((row) => row.userId !== actor.userId || row.upload.id !== id);
	}
}

export class InMemoryUploadObjects implements AttachmentStorage {
	removed: string[] = [];
	failOn?: string;
	absent = new Set<string>();

	async remove(objectKey: string): Promise<void> {
		if (objectKey === this.failOn) throw new Error('object store unavailable');
		if (this.absent.has(objectKey)) return;
		this.removed.push(objectKey);
		this.absent.add(objectKey);
	}
}
