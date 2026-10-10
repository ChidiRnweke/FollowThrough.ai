import type { ArtifactId } from '$lib/models/deliverables';
export class ArtifactActionStore {
	private requests = $state<readonly { readonly id: ArtifactId; readonly token: symbol }[]>([]);
	private stopped = false;
	get closed(): boolean {
		return this.stopped;
	}
	busy(id: ArtifactId): boolean {
		return this.requests.some((request) => request.id === id);
	}
	begin(id: ArtifactId, token: symbol): void {
		this.requests = [...this.requests, { id, token }];
	}
	finish(token: symbol): void {
		this.requests = this.requests.filter((request) => request.token !== token);
	}
	close(): void {
		this.stopped = true;
		this.requests = [];
	}
}
