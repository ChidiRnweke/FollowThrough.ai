import type { ShellContext } from '$lib/models/workspace';
import {
	normalizeLanguageModelId,
	type AgentPreferenceValues,
	type Conversation
} from '$lib/models/agent';
import type { WorkspaceBootstrap } from '$lib/models/workspace-bootstrap';
import {
	readStoredBootstrap,
	storeBootstrap,
	clearBootstrap,
	workspaceBootstrapKey,
	workspaceAccountHint
} from '$lib/client/sync/bootstrap-storage';
import { fetchWorkspaceBootstrap } from '$lib/client/sync/workspace-transport';
import { createWorkspaceResources, type WorkspaceResources } from './resources.svelte';

export interface WorkspaceSession {
	resources: WorkspaceResources;
	bootstrap: WorkspaceBootstrap;
	startupError: string | null;
	readonly shell: ShellContext;
	readonly preferences: AgentPreferenceValues;
	readonly agentDefaults: WorkspaceBootstrap['agentDefaults'];
	readonly sessions: readonly Conversation[];
}
let current = $state<WorkspaceSession | null>(null);
let starting: Promise<WorkspaceSession> | null = null;
let generation = 0;
let detach: (() => void) | null = null;

const stop = (): void => {
	generation++;
	current?.resources.stop();
	current = null;
	starting = null;
	detach?.();
	detach = null;
};
const stillBound = (): boolean =>
	current !== null && workspaceAccountHint(document.cookie) === current.bootstrap.accountId;
type SessionSynchronization =
	{ kind: 'complete' | 'stopped' } | { kind: 'failure'; message: string };
const synchronize = async (): Promise<SessionSynchronization> => {
	const session = current;
	if (!session) return { kind: 'stopped' };
	if (!stillBound()) {
		stop();
		window.location.reload();
		return { kind: 'stopped' };
	}
	session.resources.setOnline(navigator.onLine);
	try {
		if (session.startupError && navigator.onLine) await refreshBootstrap();
		await session.resources.synchronize();
		if (current === session && !stillBound()) {
			stop();
			window.location.reload();
			return { kind: 'stopped' };
		}
		return { kind: 'complete' };
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Workspace synchronization failed';
		if (current === session) session.startupError = message;
		return { kind: 'failure', message };
	}
};

const refreshBootstrap = async (): Promise<
	{ kind: 'complete' } | { kind: 'failure'; message: string }
> => {
	const session = current;
	if (!session || !navigator.onLine) return { kind: 'complete' };
	try {
		const bootstrap = await fetchWorkspaceBootstrap();
		if (current !== session) return { kind: 'complete' };
		if (bootstrap.accountId !== session.bootstrap.accountId || !stillBound()) {
			stop();
			window.location.reload();
			return { kind: 'complete' };
		}
		storeBootstrap(localStorage, bootstrap);
		session.bootstrap = bootstrap;
		session.startupError = null;
		return { kind: 'complete' };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Deployment settings could not be refreshed';
		if (current === session) session.startupError = message;
		return { kind: 'failure', message };
	}
};

const begin = async (): Promise<WorkspaceSession> => {
	const openingGeneration = generation;
	const stored = readStoredBootstrap(
		localStorage.getItem(workspaceBootstrapKey),
		workspaceAccountHint(document.cookie)
	);
	if (stored.kind === 'corrupt') throw new Error(stored.message);
	const bootstrap = stored.kind === 'stored' ? stored.value : await fetchWorkspaceBootstrap();
	if (
		generation !== openingGeneration ||
		workspaceAccountHint(document.cookie) !== bootstrap.accountId
	)
		throw new Error('The workspace account changed while opening');
	storeBootstrap(localStorage, bootstrap);
	const resources = createWorkspaceResources(bootstrap.accountId);
	resources.setOnline(navigator.onLine);
	current = {
		resources,
		bootstrap,
		startupError: null,
		get shell() {
			const shell = resources.views.shell(bootstrap.accountId);
			if (!shell)
				throw new Error('This account’s workspace has not been downloaded to this device');
			return shell;
		},
		get preferences() {
			const preferences = resources.views.get('agent_preferences', bootstrap.accountId);
			if (preferences) return preferences;
			const state = resources.state({ type: 'agent_preferences', id: [bootstrap.accountId] });
			if (state?.kind === 'present' || resources.availability === 'unknown')
				throw new Error('Agent preferences have not been downloaded to this device');
			return resources.views.agentPreferences(bootstrap.accountId);
		},
		get agentDefaults() {
			return {
				chatModelId: normalizeLanguageModelId(
					this.preferences.defaultModel ?? this.bootstrap.agentDefaults.chatModelId
				),
				visionModelId: normalizeLanguageModelId(
					this.preferences.defaultVisionModel ?? this.bootstrap.agentDefaults.visionModelId
				)
			};
		},
		get sessions() {
			return resources.views
				.all('conversations')
				.filter((conversation) => conversation.kind === 'chat')
				.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
		}
	};
	const session = current;
	await resources.initialize();
	await resources.prepare([
		'users',
		'projects',
		'notes',
		'skills',
		'suggestions',
		'agent_preferences',
		'conversations'
	]);
	if (generation !== openingGeneration || current !== session)
		throw new Error('The workspace account changed while opening');
	const refresh = (): void => {
		void synchronize();
	};
	const offline = (): void => resources.setOnline(false);
	const visibility = (): void => {
		if (document.visibilityState === 'visible') refresh();
	};
	const storage = (event: StorageEvent): void => {
		if (event.key !== workspaceBootstrapKey) return;
		if (!stillBound() || event.newValue === null) {
			stop();
			window.location.reload();
		}
	};
	window.addEventListener('online', refresh);
	window.addEventListener('offline', offline);
	window.addEventListener('focus', refresh);
	window.addEventListener('storage', storage);
	document.addEventListener('visibilitychange', visibility);
	detach = () => {
		window.removeEventListener('online', refresh);
		window.removeEventListener('offline', offline);
		window.removeEventListener('focus', refresh);
		window.removeEventListener('storage', storage);
		document.removeEventListener('visibilitychange', visibility);
	};
	if (stored.kind === 'stored') void refreshBootstrap();
	return session;
};

/** One active account; routes retain this session while navigation only starts background sync. */
export const workspaceSession = {
	get current(): WorkspaceSession | null {
		return current;
	},
	start(): Promise<WorkspaceSession> {
		if (!starting) {
			const pending = begin().catch((error) => {
				if (starting === pending) stop();
				throw error;
			});
			starting = pending;
		}
		return starting;
	},
	synchronize,
	stop,
	signOut(): void {
		stop();
		clearBootstrap(localStorage);
	}
};
