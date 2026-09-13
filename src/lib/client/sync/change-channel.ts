import { z } from 'zod';

export type WorkspaceChange = 'writes' | 'cache';
/** Notifications are hints to reread IndexedDB, never a second source of records. */
export class WorkspaceChangeChannel {
	private readonly channel: BroadcastChannel;
	private closed = false;
	private readonly listeners = new Set<(change: WorkspaceChange) => void>();
	constructor(accountId: string) {
		this.channel = new BroadcastChannel(`workspace-sync:changes:${accountId}`);
		this.channel.onmessage = (event) => {
			const parsed = z.enum(['writes', 'cache']).safeParse(event.data);
			if (parsed.success) for (const listener of this.listeners) listener(parsed.data);
		};
	}
	subscribe(listener: (change: WorkspaceChange) => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
	publish(change: WorkspaceChange): void {
		if (!this.closed) this.channel.postMessage(change);
	}
	close(): void {
		this.closed = true;
		this.listeners.clear();
		this.channel.close();
	}
}
