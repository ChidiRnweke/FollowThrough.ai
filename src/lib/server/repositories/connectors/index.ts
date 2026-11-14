import type {
	Connector,
	ConnectorCredential,
	ConnectorCredentialRead,
	ConnectorId,
	ConnectorTool,
	ConnectorToolPolicy,
	NamedSnapshotEntry,
	NewConnector,
	PendingAuthorization,
	RunConnectorTool,
	ToolScope
} from '$lib/models/connectors';
import type { ToolDistance } from '$lib/models/agent/tool-index';

/** The bound user's connectors. Credentials are sealed here and nowhere else. */
export interface ConnectorRepository {
	list(): Promise<readonly Connector[]>;
	find(id: ConnectorId): Promise<Connector | undefined>;
	insert(connector: NewConnector, refreshedAt: Date): Promise<Connector>;
	credential(id: ConnectorId): Promise<ConnectorCredentialRead>;
	/** Stores a new credential and marks the connector connected. */
	replaceCredential(id: ConnectorId, credential: ConnectorCredential): Promise<void>;
	requireReauthorization(id: ConnectorId, reason: string): Promise<void>;
	/** False when the bound user has no such connector. */
	remove(id: ConnectorId): Promise<boolean>;
	tools(scope: ToolScope): Promise<readonly ConnectorTool[]>;
	/**
	 * Makes `entries` the connector's tools. A tool the server still lists keeps
	 * the user's policy; a tool it no longer lists is deleted.
	 */
	replaceTools(
		id: ConnectorId,
		entries: readonly NamedSnapshotEntry[],
		refreshedAt: Date
	): Promise<void>;
	setToolPolicy(
		id: ConnectorId,
		serverName: string,
		policy: ConnectorToolPolicy
	): Promise<ConnectorTool | undefined>;
	/** Every stored tool with its connector's title. */
	runTools(): Promise<readonly RunConnectorTool[]>;
	/** Cosine distances for the named tools whose vector `model` produced; others are absent. */
	toolDistances(
		vector: readonly number[],
		names: readonly string[],
		model: string
	): Promise<readonly ToolDistance[]>;
}

export type TakenAuthorization =
	| { readonly kind: 'found'; readonly request: PendingAuthorization }
	| { readonly kind: 'expired' }
	/** No attempt with this state for the bound user: unknown, already used, or another user's. */
	| { readonly kind: 'missing' };

/** The bound user's OAuth attempts in flight. */
export interface ConnectorAuthorizationRepository {
	insert(stateHash: string, request: PendingAuthorization, expiresAt: Date): Promise<void>;
	/** Removes and returns the attempt, so a state is used at most once. */
	take(stateHash: string, now: Date): Promise<TakenAuthorization>;
}
