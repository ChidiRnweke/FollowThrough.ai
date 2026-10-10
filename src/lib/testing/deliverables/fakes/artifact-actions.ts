import type {
	ArtifactActionsRemote,
	ArtifactDownloadNavigation
} from '$lib/models/browser-deliverables';
import type { ArtifactId } from '$lib/models/deliverables';
export class InMemoryArtifactDownloads implements ArtifactDownloadNavigation {
	readonly urls: string[] = [];
	assign(url: string): void {
		this.urls.push(url);
	}
}
export class InMemoryArtifactActions implements ArtifactActionsRemote {
	readonly available = new Set<ArtifactId>();
	failure: Error | undefined;
	private gate: { started(): void; wait: Promise<void> } | undefined;
	pause(): { started: Promise<void>; release(): void } {
		const started = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		this.gate = { started: started.resolve, wait: release.promise };
		return { started: started.promise, release: release.resolve };
	}
	private async read(id: ArtifactId): Promise<void> {
		const gate = this.gate;
		this.gate = undefined;
		if (gate) {
			gate.started();
			await gate.wait;
		}
		if (this.failure) throw this.failure;
		if (!this.available.has(id)) throw new Error('Artifact not found');
	}
	async download(id: ArtifactId) {
		await this.read(id);
		return { url: `https://storage.test/${id}.pdf` };
	}
	async regenerate(id: ArtifactId) {
		await this.read(id);
		return { downloadUrl: `https://storage.test/regenerated-${id}.pdf` };
	}
	async delete(id: ArtifactId): Promise<void> {
		await this.read(id);
		this.available.delete(id);
	}
}
