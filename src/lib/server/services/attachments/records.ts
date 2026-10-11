import type {
	AttachmentUpload,
	AttachmentVersion,
	AttachmentVersionId,
	AttachmentView,
	OwnedAttachmentUpload,
	UploadRetentionCursor
} from '$lib/models/attachments';
import type { UserId } from '$lib/models/identity';
import type {
	AttachmentBacklogRepository,
	AttachmentRepository
} from '$lib/server/repositories/attachments';
import type { AttachmentClaims } from '$lib/server/repositories/attachments/claims';

/** A version waiting for extraction, with the user it belongs to. */
export interface PendingAttachmentVersion {
	readonly userId: UserId;
	readonly versionId: AttachmentVersionId;
}

/** The user's attachment versions while they are processed. */
export interface AttachmentVersions {
	findVersionForUpdate(versionId: AttachmentVersionId): Promise<AttachmentView | undefined>;
	updateVersion(version: AttachmentVersion): Promise<AttachmentView>;
}
export class AttachmentVersionService implements AttachmentVersions {
	constructor(private readonly repository: AttachmentRepository) {}
	findVersionForUpdate(versionId: AttachmentVersionId) {
		return this.repository.findVersionForUpdate(versionId);
	}
	updateVersion(version: AttachmentVersion) {
		return this.repository.updateVersion(version);
	}
}

/** A held processing claim; work checks it before it records a result. */
export interface AttachmentClaim {
	/** @throws if another worker took the version over. */
	assertOwned(): Promise<void>;
}
/** One worker at a time processes a version; another worker finds it busy. */
export interface AttachmentProcessingClaims {
	withClaim<T>(
		versionId: AttachmentVersionId,
		work: (claim: AttachmentClaim) => Promise<T>
	): Promise<{ kind: 'claimed'; value: T } | { kind: 'busy' }>;
}
export class AttachmentClaimService implements AttachmentProcessingClaims {
	constructor(private readonly claims: AttachmentClaims) {}
	withClaim<T>(versionId: AttachmentVersionId, work: (claim: AttachmentClaim) => Promise<T>) {
		return this.claims.withClaim(versionId, (claim) =>
			work({ assertOwned: () => claim.assertOwned() })
		);
	}
}

/** Attachment work across every user, which the worker runs. */
export interface AttachmentBacklog {
	listPendingVersions(): Promise<readonly PendingAttachmentVersion[]>;
	listPendingObjectRemovals(): Promise<readonly string[]>;
	completeObjectRemoval(objectKey: string): Promise<void>;
	listExpiredUploads(
		cutoff: Date,
		limit: number,
		after?: UploadRetentionCursor
	): Promise<readonly OwnedAttachmentUpload[]>;
	deleteExpiredUpload(id: AttachmentUpload['id']): Promise<void>;
}
export class AttachmentBacklogService implements AttachmentBacklog {
	constructor(private readonly repository: AttachmentBacklogRepository) {}
	listPendingVersions() {
		return this.repository.listPendingVersions();
	}
	listPendingObjectRemovals() {
		return this.repository.listPendingObjectRemovals();
	}
	completeObjectRemoval(objectKey: string) {
		return this.repository.completeObjectRemoval(objectKey);
	}
	listExpiredUploads(cutoff: Date, limit: number, after?: UploadRetentionCursor) {
		return this.repository.listExpiredUploads(cutoff, limit, after);
	}
	deleteExpiredUpload(id: AttachmentUpload['id']) {
		return this.repository.deleteExpiredUpload(id);
	}
}
