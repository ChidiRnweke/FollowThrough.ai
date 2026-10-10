import {
	workspaceSessionState,
	workspaceSessionEnvironment
} from '$lib/factories/workspace/session';
import { workspaceAccounts } from '$lib/factories/workspace/capabilities';
import { CacheCommitService } from '$lib/services/sync/state';
import {
	ArtifactActions,
	type ArtifactActionsController
} from '$lib/controllers/deliverables/artifacts';
import { ArtifactActionStore } from '$lib/stores/deliverables/artifacts.svelte';
import {
	RemoteArtifactActions,
	BrowserArtifactDownloadNavigation
} from '$lib/client/deliverables/artifacts';
export const createArtifactActions = (): ArtifactActionsController =>
	new ArtifactActions(new ArtifactActionStore(), {
		session: workspaceSessionState,
		environment: workspaceSessionEnvironment,
		accounts: workspaceAccounts,
		cacheMerge: new CacheCommitService(),
		remote: new RemoteArtifactActions(),
		navigation: new BrowserArtifactDownloadNavigation()
	});
