import type { UploadRetentionCursor } from '$lib/models/attachments';

export interface UploadTraversal {
	readonly cutoff: Date;
	readonly after: UploadRetentionCursor;
}
/** One worker's position in its current bounded pass. */
export class UploadRetentionStore {
	private traversal: UploadTraversal | undefined;
	read(): UploadTraversal | undefined {
		return this.traversal;
	}
	update(traversal: UploadTraversal | undefined): void {
		this.traversal = traversal;
	}
}
