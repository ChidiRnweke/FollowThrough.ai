import type { ArtifactId } from '$lib/models/deliverables';
import type { ArtifactActionStore } from '$lib/stores/deliverables/artifacts.svelte';
import type {
	WorkspaceSession,
	WorkspaceSessionController
} from '$lib/controllers/workspace/session';
export interface ArtifactActionsRemote {
	download(id: ArtifactId): Promise<{ readonly url: string }>;
	regenerate(id: ArtifactId): Promise<{ readonly downloadUrl: string }>;
	delete(id: ArtifactId): Promise<void>;
}
export interface ArtifactDownloadNavigation {
	assign(url: string): void;
}
export type ArtifactActionOutcome =
	| { readonly kind: 'complete' | 'superseded' }
	| { readonly kind: 'failure'; readonly message: string };
export interface ArtifactActionsController {
	busy(id: ArtifactId): boolean;
	download(id: ArtifactId): Promise<ArtifactActionOutcome>;
	regenerate(id: ArtifactId): Promise<ArtifactActionOutcome>;
	remove(id: ArtifactId): Promise<ArtifactActionOutcome>;
	close(): void;
}
export class ArtifactActions implements ArtifactActionsController {
	constructor(
		private readonly state: ArtifactActionStore,
		private readonly workspace: WorkspaceSessionController,
		private readonly remote: ArtifactActionsRemote,
		private readonly navigation: ArtifactDownloadNavigation
	) {}
	busy(id: ArtifactId): boolean {
		return this.state.busy(id);
	}
	private current(session: WorkspaceSession): boolean {
		return !this.state.closed && session.resources.active && this.workspace.current === session;
	}
	download(id: ArtifactId): Promise<ArtifactActionOutcome> {
		return this.perform(id, 'Could not prepare the download.', async (current) => {
			const result = await this.remote.download(id);
			if (current()) this.navigation.assign(result.url);
		});
	}
	regenerate(id: ArtifactId): Promise<ArtifactActionOutcome> {
		return this.perform(id, 'Could not regenerate the document.', async (current) => {
			const result = await this.remote.regenerate(id);
			if (!current()) return;
			this.navigation.assign(result.downloadUrl);
			await this.workspace.synchronize();
		});
	}
	remove(id: ArtifactId): Promise<ArtifactActionOutcome> {
		return this.perform(id, 'Could not delete the artifact.', async (current) => {
			await this.remote.delete(id);
			if (current()) await this.workspace.synchronize();
		});
	}
	private async perform(
		id: ArtifactId,
		failure: string,
		operation: (current: () => boolean) => Promise<void>
	): Promise<ArtifactActionOutcome> {
		if (this.state.closed) return { kind: 'superseded' };
		const token = Symbol();
		let session: WorkspaceSession | undefined;
		this.state.begin(id, token);
		try {
			session = await this.workspace.start();
			const current = () => session !== undefined && this.current(session);
			if (!current()) return { kind: 'superseded' };
			await operation(current);
			return { kind: current() ? 'complete' : 'superseded' };
		} catch {
			if (this.state.closed || (session && !this.current(session))) return { kind: 'superseded' };
			return { kind: 'failure', message: failure };
		} finally {
			this.state.finish(token);
		}
	}
	close(): void {
		this.state.close();
	}
}
