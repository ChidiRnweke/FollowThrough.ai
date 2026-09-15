import type {
	AttachmentClaims,
	AttachmentClaim
} from '$lib/server/repositories/attachments/claims';
import type { AttachmentVersionId } from '$lib/models/attachments';
export class InMemoryAttachmentClaims implements AttachmentClaims {
	private readonly owners = new Map<AttachmentVersionId, symbol>();
	lose(versionId: AttachmentVersionId) {
		this.owners.delete(versionId);
	}
	async withClaim<T>(
		versionId: AttachmentVersionId,
		work: (claim: AttachmentClaim) => Promise<T>
	): Promise<{ kind: 'claimed'; value: T } | { kind: 'busy' }> {
		if (this.owners.has(versionId)) return { kind: 'busy' };
		const owner = Symbol();
		this.owners.set(versionId, owner);
		try {
			return {
				kind: 'claimed',
				value: await work({
					assertOwned: async () => {
						if (this.owners.get(versionId) !== owner) throw new Error('Attachment claim lost');
					}
				})
			};
		} finally {
			if (this.owners.get(versionId) === owner) this.owners.delete(versionId);
		}
	}
}
