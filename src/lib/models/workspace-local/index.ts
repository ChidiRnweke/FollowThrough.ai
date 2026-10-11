import type { StoredCache } from '$lib/models/sync';
import type { OutboxProjection } from '$lib/models/outbox';

export interface WorkspaceLocalProjection<C, T> {
	readonly cache: StoredCache<T>;
	readonly writes: OutboxProjection<C, T>;
}
