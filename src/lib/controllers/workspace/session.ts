import type {
	IAgentModelSelectionService,
	IAgentModelChoiceService
} from '$lib/services/agent/model-selection';
import type { DateTime } from '$lib/models/workspace';
import type { WorkspaceValues } from '$lib/models/workspace-records';
import type { WorkspaceDraftController } from '$lib/controllers/workspace/resources';

import type { ShellContext } from '$lib/models/workspace-views';
import type { AgentModel, AgentPreferenceValues, Conversation } from '$lib/models/agent';
import type { WorkspaceBootstrap, StoredBootstrap } from '$lib/models/workspace-bootstrap';
import type { WorkspaceResourcesController } from '$lib/controllers/workspace/resources';
import type { WorkspaceSessionStore } from '$lib/stores/workspace/session.svelte';
export interface WorkspaceSession {
	readonly resources: WorkspaceResourcesController;
	readonly bootstrap: WorkspaceBootstrap;
	readonly startupError: string | null;
	readonly shell: ShellContext;
	readonly preferences: AgentPreferenceValues;
	readonly agentDefaults: WorkspaceBootstrap['agentDefaults'];
	readonly agentModels: readonly AgentModel[];
	readonly sessions: readonly Conversation[];
}

export type SessionSynchronization =
	| { readonly kind: 'complete' | 'stopped' }
	| { readonly kind: 'failure'; readonly message: string };
export interface WorkspaceSessionController {
	readonly current: WorkspaceSession | null;
	openPreferences<K extends 'agent_preferences' | 'user_preferences'>(
		type: K
	): Promise<{ draft: WorkspaceDraftController<K>; value: WorkspaceValues[K] }>;
	start(): Promise<WorkspaceSession>;
	synchronize(force?: boolean): Promise<SessionSynchronization>;
	stop(): void;
	signOut(): void;
	downloadLocalWrites(): Promise<Blob>;
	resetLocalWorkspace(): Promise<void>;
}
export interface WorkspaceSessionEvents {
	refresh(): void;
	offline(): void;
	bootstrapChanged(removed: boolean): void;
}
export interface WorkspaceSessionEnvironment {
	readonly accountId: string | null;
	readonly online: boolean;
	readBootstrap(): StoredBootstrap;
	fetchBootstrap(): Promise<WorkspaceBootstrap>;
	saveBootstrap(bootstrap: WorkspaceBootstrap): void;
	clearBootstrap(): void;
	reload(): void;
	listen(events: WorkspaceSessionEvents): () => void;
}
export interface WorkspaceRecovery {
	downloadAccount(accountId: string): Promise<Blob>;
	resetAccount(accountId: string): Promise<void>;
}
export interface WorkspaceResourceFactory {
	create(accountId: string): WorkspaceResourcesController;
}

/** One account binding; late work cannot publish into a replacement session. */
export class WorkspaceSessions implements WorkspaceSessionController {
	constructor(
		private readonly state: WorkspaceSessionStore,
		private readonly environment: WorkspaceSessionEnvironment,
		private readonly resources: WorkspaceResourceFactory,
		private readonly recovery: WorkspaceRecovery,
		private readonly models: {
			modelSelection: IAgentModelSelectionService;
			modelChoices: IAgentModelChoiceService;
		}
	) {}
	get current(): WorkspaceSession | null {
		return this.state.current;
	}
	stop(): void {
		const session = this.state.current;
		const detach = this.state.detach;
		this.state.clear();
		session?.resources.stop();
		detach?.();
	}
	private stillBound(): boolean {
		return (
			this.state.current !== null &&
			this.environment.accountId === this.state.current.bootstrap.accountId
		);
	}
	async synchronize(force = false): Promise<SessionSynchronization> {
		const session = this.state.current;
		if (!session) return { kind: 'stopped' };
		if (!this.stillBound()) {
			this.stop();
			this.environment.reload();
			return { kind: 'stopped' };
		}
		session.resources.setOnline(this.environment.online);
		try {
			if (session.startupError && this.environment.online) await this.refreshBootstrap();
			await Promise.all([
				session.resources.open({ type: 'users', id: [session.bootstrap.accountId] }),
				session.resources.synchronize(force)
			]);
			if (this.state.current === session && !this.stillBound()) {
				this.stop();
				this.environment.reload();
				return { kind: 'stopped' };
			}
			return { kind: 'complete' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Workspace synchronization failed';
			this.state.fail(session, message);
			return { kind: 'failure', message };
		}
	}
	private async refreshBootstrap(): Promise<SessionSynchronization> {
		const session = this.state.current;
		if (!session || !this.environment.online) return { kind: 'complete' };
		try {
			const bootstrap = await this.environment.fetchBootstrap();
			if (this.state.current !== session) return { kind: 'complete' };
			if (bootstrap.accountId !== session.bootstrap.accountId || !this.stillBound()) {
				this.stop();
				this.environment.reload();
				return { kind: 'complete' };
			}
			this.environment.saveBootstrap(bootstrap);
			this.state.refresh(session, bootstrap);
			return { kind: 'complete' };
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Deployment settings could not be refreshed';
			this.state.fail(session, message);
			return { kind: 'failure', message };
		}
	}
	private async begin(): Promise<WorkspaceSession> {
		const openingGeneration = this.state.generation;
		const stored = this.environment.readBootstrap();
		if (stored.kind === 'corrupt' && !this.environment.online)
			throw new Error(
				'Saved startup settings could not be read. Reconnect to restore them; saved edits remain on this device.'
			);
		const bootstrap =
			stored.kind === 'stored' ? stored.value : await this.environment.fetchBootstrap();
		if (
			this.state.generation !== openingGeneration ||
			this.environment.accountId !== bootstrap.accountId
		)
			throw new Error('The workspace account changed while opening');
		this.environment.saveBootstrap(bootstrap);
		const resources = this.resources.create(bootstrap.accountId);
		resources.setOnline(this.environment.online);
		this.state.publish(this.session(resources, bootstrap));
		const session = this.state.current;
		if (!session) throw new Error('The workspace account changed while opening');
		await resources.initialize();
		// Publish before inventory completion so targeted reads cannot delay background replication.
		if (this.state.generation !== openingGeneration || this.state.current !== session)
			throw new Error('The workspace account changed while opening');
		void this.synchronize();
		this.state.attach(
			this.environment.listen({
				refresh: () => {
					void this.synchronize();
				},
				offline: () => resources.setOnline(false),
				bootstrapChanged: (removed) => {
					if (!this.stillBound() || removed) {
						this.stop();
						this.environment.reload();
					}
				}
			})
		);
		if (stored.kind === 'stored') void this.refreshBootstrap();
		return session;
	}

	private session(
		resources: WorkspaceResourcesController,
		bootstrap: WorkspaceBootstrap
	): WorkspaceSession {
		const models = this.models;
		return {
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
				if ((state && state.kind !== 'deleted') || resources.availability === 'unknown')
					throw new Error('Agent preferences have not been downloaded to this device');
				return resources.views.agentPreferences(bootstrap.accountId);
			},
			get agentDefaults() {
				return {
					chatModelId: models.modelSelection.resolveDefaultAgentModel(
						this.preferences,
						this.bootstrap.agentDefaults.chatModelId
					),
					visionModelId: models.modelSelection.resolveDefaultVisionModel(
						this.preferences,
						this.bootstrap.agentDefaults.visionModelId
					)
				};
			},
			get agentModels() {
				return models.modelChoices.configuredAgentModels(
					this.bootstrap.agentModels,
					this.agentDefaults
				);
			},
			get sessions() {
				return resources.views
					.all('conversations')
					.filter((conversation) => conversation.kind === 'chat')
					.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
			}
		};
	}

	async openPreferences<K extends 'agent_preferences' | 'user_preferences'>(
		type: K
	): Promise<{ draft: WorkspaceDraftController<K>; value: WorkspaceValues[K] }> {
		const session = await this.start();
		const draft = session.resources.draft({ type, id: [session.bootstrap.accountId] });
		const timestamp = new Date().toISOString() as DateTime;
		const common = { userId: session.shell.user.id, createdAt: timestamp, updatedAt: timestamp };
		const opened = await draft.readOrCreate(
			type === 'agent_preferences'
				? {
						type: 'agent_preferences',
						value: { ...common, executionMode: 'approval_required', inlineSuggestionsEnabled: true }
					}
				: { type: 'user_preferences', value: common }
		);
		if (opened.kind !== 'ready')
			throw new Error(draft.lastError ?? 'These preferences are unavailable');
		return { draft, value: opened.value };
	}

	start(): Promise<WorkspaceSession> {
		const starting = this.state.starting;
		if (starting) return starting;
		const pending = this.begin().catch((error) => {
			if (this.state.starting === pending) this.stop();
			throw error;
		});
		this.state.start(pending);
		return pending;
	}
	async downloadLocalWrites(): Promise<Blob> {
		const accountId = this.environment.accountId;
		if (!accountId)
			throw new Error('Sign in to identify the account whose saved edits you want to download');
		return this.recovery.downloadAccount(accountId);
	}
	async resetLocalWorkspace(): Promise<void> {
		const accountId = this.environment.accountId;
		if (!accountId) throw new Error('Sign in to identify the account to reset');
		this.stop();
		await this.recovery.resetAccount(accountId);
	}
	signOut(): void {
		this.stop();
		this.environment.clearBootstrap();
	}
}
