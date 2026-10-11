import type { AttachmentUpload } from '$lib/models/attachments';
import type {
	OwnedAttachmentUpload,
	UploadRetentionCursor
} from '$lib/server/repositories/attachments/attachments';
import type { IAttachmentStorage } from '$lib/server/services/attachments/object-storage';
import type { AttachmentBacklog } from '$lib/server/services/attachments/records';

export class InMemoryUploadReservations implements Pick<
	AttachmentBacklog,
	'listExpiredUploads' | 'deleteExpiredUpload'
> {
	deleted: string[] = [];
	deleteFailures = new Set<AttachmentUpload['id']>();

	constructor(public rows: OwnedAttachmentUpload[] = []) {}

	async listExpiredUploads(
		before: Date,
		limit: number,
		after?: UploadRetentionCursor
	): Promise<readonly OwnedAttachmentUpload[]> {
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

	async deleteExpiredUpload(id: AttachmentUpload['id']): Promise<void> {
		if (this.deleteFailures.has(id)) throw new Error('Reservation deletion failed');
		if (this.rows.some((row) => row.upload.id === id)) this.deleted.push(id);
		this.rows = this.rows.filter((row) => row.upload.id !== id);
	}
}

export class InMemoryUploadObjects implements Pick<IAttachmentStorage, 'remove'> {
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
