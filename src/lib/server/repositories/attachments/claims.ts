import type { AttachmentVersionId } from '$lib/models/attachments';
export interface AttachmentClaim {
	assertOwned(): Promise<void>;
}
export interface AttachmentClaims {
	withClaim<T>(
		versionId: AttachmentVersionId,
		work: (claim: AttachmentClaim) => Promise<T>
	): Promise<{ kind: 'claimed'; value: T } | { kind: 'busy' }>;
}
