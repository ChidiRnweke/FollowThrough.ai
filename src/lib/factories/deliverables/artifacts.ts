import {
	ArtifactActions,
	type ArtifactActionsController
} from '$lib/controllers/deliverables/artifacts';
import { ArtifactActionStore } from '$lib/stores/deliverables/artifacts.svelte';
import {
	RemoteArtifactActions,
	BrowserArtifactDownloadNavigation
} from '$lib/client/deliverables/artifacts';
import { workspaceSession } from '$lib/factories/workspace/session';
export const createArtifactActions = (): ArtifactActionsController =>
	new ArtifactActions(
		new ArtifactActionStore(),
		workspaceSession,
		new RemoteArtifactActions(),
		new BrowserArtifactDownloadNavigation()
	);
