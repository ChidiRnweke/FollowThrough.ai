import {
	downloadArtifact,
	regenerateArtifact,
	deleteArtifact
} from '$lib/remote/deliverables/deliverables.remote';
import type { ArtifactId } from '$lib/models/deliverables';
import type {
	ArtifactActionsRemote,
	ArtifactDownloadNavigation
} from '$lib/models/browser-deliverables';
export class RemoteArtifactActions implements ArtifactActionsRemote {
	download(id: ArtifactId) {
		return downloadArtifact({ artifactId: id });
	}
	regenerate(id: ArtifactId) {
		return regenerateArtifact({ artifactId: id });
	}
	async delete(id: ArtifactId): Promise<void> {
		await deleteArtifact({ artifactId: id });
	}
}
export class BrowserArtifactDownloadNavigation implements ArtifactDownloadNavigation {
	assign(url: string): void {
		window.location.assign(url);
	}
}
