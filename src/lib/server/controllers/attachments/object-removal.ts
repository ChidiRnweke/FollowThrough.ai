import type { ScheduledTask } from '$lib/models/maintenance';
import type { AttachmentRepository } from '$lib/server/repositories/attachments/attachments';

/** Only committed queue entries are visible; storage removal is idempotent. */
export class AttachmentObjectRemoval implements ScheduledTask {
	readonly name = 'attachment-object-removal';
	readonly intervalMs = 60_000;
	constructor(
		private readonly repository: Pick<
			AttachmentRepository,
			'listPendingObjectRemovals' | 'completeObjectRemoval'
		>,
		private readonly storage: { remove(objectKey: string): Promise<void> }
	) {}
	async run(): Promise<void> {
		const failures: Error[] = [];
		for (const key of await this.repository.listPendingObjectRemovals()) {
			const result = await this.remove(key);
			if (result.kind === 'failure') failures.push(result.error);
		}
		if (failures.length)
			throw new AggregateError(failures, 'Attachment objects remain queued for removal');
	}
	private async remove(
		key: string
	): Promise<{ kind: 'removed' } | { kind: 'failure'; error: Error }> {
		try {
			await this.storage.remove(key);
			await this.repository.completeObjectRemoval(key);
			return { kind: 'removed' };
		} catch (error) {
			return {
				kind: 'failure',
				error: new Error(`Could not remove attachment object ${key}`, { cause: error })
			};
		}
	}
}
