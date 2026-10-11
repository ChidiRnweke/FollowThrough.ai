import type {
	AttachmentUpload,
	AttachmentVersion,
	AttachmentVersionId,
	AttachmentView,
	OwnedAttachmentUpload,
	UploadRetentionCursor
} from '$lib/models/attachments';
import type { ActorContext, UserId } from '$lib/models/identity';
import type { AttachmentRepository } from '$lib/server/repositories/attachments';
import type { AttachmentClaims } from '$lib/server/repositories/attachments/claims';

/** The processing backlog: versions waiting for extraction, and their recorded results. */
export interface AttachmentVersions {
	listPendingVersions(): Promise<readonly { userId: UserId; versionId: AttachmentVersionId }[]>;
	findVersionForUpdate(
		actor: ActorContext,
		versionId: AttachmentVersionId
	): Promise<AttachmentView | undefined>;
	updateVersion(actor: ActorContext, version: AttachmentVersion): Promise<AttachmentView>;
}
export class AttachmentVersionService implements AttachmentVersions {
	constructor(private readonly repository: AttachmentRepository) {}
	listPendingVersions() {
		return this.repository.listPendingVersions();
	}
	findVersionForUpdate(actor: ActorContext, versionId: AttachmentVersionId) {
		return this.repository.findVersionForUpdate(actor, versionId);
	}
	updateVersion(actor: ActorContext, version: AttachmentVersion) {
		return this.repository.updateVersion(actor, version);
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

/** Records of stored objects that no attachment uses any more. */
export interface AttachmentCleanup {
	listPendingObjectRemovals(): Promise<readonly string[]>;
	completeObjectRemoval(objectKey: string): Promise<void>;
	listExpiredUploads(
		cutoff: Date,
		limit: number,
		after?: UploadRetentionCursor
	): Promise<readonly OwnedAttachmentUpload[]>;
	deleteUpload(actor: ActorContext, id: AttachmentUpload['id']): Promise<void>;
}
export class AttachmentCleanupService implements AttachmentCleanup {
	constructor(private readonly repository: AttachmentRepository) {}
	listPendingObjectRemovals() {
		return this.repository.listPendingObjectRemovals();
	}
	completeObjectRemoval(objectKey: string) {
		return this.repository.completeObjectRemoval(objectKey);
	}
	listExpiredUploads(cutoff: Date, limit: number, after?: UploadRetentionCursor) {
		return this.repository.listExpiredUploads(cutoff, limit, after);
	}
	deleteUpload(actor: ActorContext, id: AttachmentUpload['id']) {
		return this.repository.deleteUpload(actor, id);
	}
}
