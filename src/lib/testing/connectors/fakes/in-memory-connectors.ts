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
	StoredCredential,
	ToolScope
} from '$lib/models/connectors';
import type {
	ConnectorAuthorizationRepository,
	ConnectorRepository,
	TakenAuthorization
} from '$lib/server/repositories/connectors';
import type {
	RestoreSnapshot,
	SnapshotParticipant
} from '$lib/testing/workspace/fakes/in-memory-transaction';

type DateTime = Connector['createdAt'];

interface StoredConnector {
	readonly connector: Connector;
	readonly credential: StoredCredential;
	/** Set when the credential was sealed under a key the deployment has since dropped. */
	readonly retiredKey: boolean;
}

/** One user's connector rows, as the Postgres repository keeps them. */
export class InMemoryConnectorRecords implements ConnectorRepository, SnapshotParticipant {
	private connectors = new Map<ConnectorId, StoredConnector>();
	private toolRows = new Map<ConnectorId, ConnectorTool[]>();

	snapshot(): RestoreSnapshot {
		const connectors = new Map(this.connectors);
		const tools = new Map([...this.toolRows].map(([id, list]) => [id, [...list]]));
		return () => {
			this.connectors = connectors;
			this.toolRows = tools;
		};
	}

	/** The deployment rotated CONNECTOR_SECRET_KEYS without this connector's key. */
	retireKey(id: ConnectorId): void {
		const stored = this.require(id);
		this.connectors.set(id, { ...stored, retiredKey: true });
	}

	async list(): Promise<readonly Connector[]> {
		return [...this.connectors.values()].map((stored) => this.view(stored));
	}

	async find(id: ConnectorId): Promise<Connector | undefined> {
		const stored = this.connectors.get(id);
		return stored ? this.view(stored) : undefined;
	}

	async insert(connector: NewConnector, refreshedAt: Date): Promise<Connector> {
		if ([...this.connectors.values()].some((stored) => stored.connector.slug === connector.slug))
			throw new Error(
				'duplicate key value violates unique constraint "connectors_user_slug_unique"'
			);
		const created: Connector = {
			id: connector.id,
			slug: connector.slug,
			source: connector.source,
			title: connector.title,
			serverUrl: connector.serverUrl,
			authentication: connector.credential.kind,
			status: { kind: 'connected' },
			toolsRefreshedAt: refreshedAt.toISOString() as DateTime,
			createdAt: refreshedAt.toISOString() as DateTime
		};
		this.connectors.set(connector.id, {
			connector: created,
			credential: connector.credential,
			retiredKey: false
		});
		return created;
	}

	async credential(id: ConnectorId): Promise<ConnectorCredentialRead> {
		const stored = this.require(id);
		if (stored.credential.kind === 'none') return { kind: 'none' };
		if (stored.retiredKey) return { kind: 'unreadable' };
		return { kind: 'readable', credential: stored.credential };
	}

	async replaceCredential(id: ConnectorId, credential: ConnectorCredential): Promise<void> {
		const stored = this.require(id);
		this.connectors.set(id, {
			connector: {
				...stored.connector,
				authentication: credential.kind,
				status: { kind: 'connected' }
			},
			credential,
			retiredKey: false
		});
	}

	async requireReauthorization(id: ConnectorId, reason: string): Promise<void> {
		const stored = this.require(id);
		this.connectors.set(id, {
			...stored,
			connector: {
				...stored.connector,
				status: {
					kind: 'reauthorization_required',
					reason,
					since: new Date().toISOString() as DateTime
				}
			}
		});
	}

	async remove(id: ConnectorId): Promise<boolean> {
		this.toolRows.delete(id);
		return this.connectors.delete(id);
	}

	async tools(scope: ToolScope): Promise<readonly ConnectorTool[]> {
		if (scope.kind === 'connector') return [...(this.toolRows.get(scope.connectorId) ?? [])];
		return [...this.toolRows.values()].flat();
	}

	async replaceTools(
		id: ConnectorId,
		entries: readonly NamedSnapshotEntry[],
		refreshedAt: Date
	): Promise<void> {
		const stored = this.require(id);
		const previous = new Map((this.toolRows.get(id) ?? []).map((tool) => [tool.serverName, tool]));
		this.toolRows.set(
			id,
			entries
				.map((entry) => ({
					...entry.tool,
					connectorId: id,
					modelName: entry.modelName,
					policy: previous.get(entry.tool.serverName)?.policy ?? { kind: 'default' as const }
				}))
				.sort((left, right) => left.serverName.localeCompare(right.serverName))
		);
		this.connectors.set(id, {
			...stored,
			connector: { ...stored.connector, toolsRefreshedAt: refreshedAt.toISOString() as DateTime }
		});
	}

	async setToolPolicy(
		id: ConnectorId,
		serverName: string,
		policy: ConnectorToolPolicy
	): Promise<ConnectorTool | undefined> {
		const tools = this.toolRows.get(id);
		const index = tools?.findIndex((tool) => tool.serverName === serverName) ?? -1;
		if (!tools || index < 0) return undefined;
		const updated = { ...tools[index]!, policy };
		tools[index] = updated;
		return updated;
	}

	private view(stored: StoredConnector): Connector {
		return stored.retiredKey
			? { ...stored.connector, status: { kind: 'unreadable' } }
			: stored.connector;
	}

	private require(id: ConnectorId): StoredConnector {
		const stored = this.connectors.get(id);
		if (!stored) throw new Error(`No connector ${id}`);
		return stored;
	}
}

/** One user's OAuth attempts in flight. */
export class InMemoryConnectorAuthorizations implements ConnectorAuthorizationRepository {
	private readonly attempts = new Map<string, { request: PendingAuthorization; expiresAt: Date }>();

	async insert(stateHash: string, request: PendingAuthorization, expiresAt: Date): Promise<void> {
		this.attempts.set(stateHash, { request, expiresAt });
	}

	async take(stateHash: string, now: Date): Promise<TakenAuthorization> {
		const attempt = this.attempts.get(stateHash);
		this.attempts.delete(stateHash);
		if (!attempt) return { kind: 'missing' };
		if (attempt.expiresAt <= now) return { kind: 'expired' };
		return { kind: 'found', request: attempt.request };
	}
}
