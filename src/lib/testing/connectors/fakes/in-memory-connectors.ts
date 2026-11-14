import type {
	Connector,
	ConnectorCallLabel,
	ConnectorCredential,
	ConnectorCredentialRead,
	ConnectorIcon,
	ConnectorId,
	ConnectorTool,
	ConnectorToolPolicy,
	NamedSnapshotEntry,
	NewConnector,
	PendingAuthorization,
	RunConnectorTool,
	StoredCredential,
	ToolScope
} from '$lib/models/connectors';
import type { ToolDistance } from '$lib/models/agent/tool-index';
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
	private vectors = new Map<
		string,
		{ readonly vector: readonly number[]; readonly model: string }
	>();
	private icons = new Map<ConnectorId, ConnectorIcon>();

	snapshot(): RestoreSnapshot {
		const connectors = new Map(this.connectors);
		const tools = new Map([...this.toolRows].map(([id, list]) => [id, [...list]]));
		const vectors = new Map(this.vectors);
		return () => {
			this.connectors = connectors;
			this.toolRows = tools;
			this.vectors = vectors;
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
		const others = [...this.connectors.values()].map((stored) => stored.connector);
		if (others.some((other) => other.slug === connector.slug))
			throw new Error(
				'duplicate key value violates unique constraint "connectors_user_slug_unique"'
			);
		const source = connector.source;
		if (
			source.kind === 'catalog' &&
			others.some(
				(other) => other.source.kind === 'catalog' && other.source.catalogId === source.catalogId
			)
		)
			throw new Error(
				'duplicate key value violates unique constraint "connectors_user_catalog_unique"'
			);
		const created: Connector = {
			id: connector.id,
			slug: connector.slug,
			source: connector.source,
			title: connector.title,
			serverUrl: connector.serverUrl,
			authentication: connector.credential.kind,
			status: { kind: 'connected' },
			logo:
				connector.source.kind === 'catalog'
					? { kind: 'catalog', catalogId: connector.source.catalogId }
					: { kind: 'monogram' },
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
		for (const entry of entries)
			if (entry.kind === 'usable')
				this.vectors.set(entry.modelName, { vector: entry.embedding, model: entry.embeddingModel });
			else this.vectors.delete(entry.modelName);
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

	async storeIcon(
		id: ConnectorId,
		icon: { readonly kind: 'icon'; readonly icon: ConnectorIcon } | { readonly kind: 'none' }
	): Promise<void> {
		const stored = this.require(id);
		if (icon.kind === 'icon') this.icons.set(id, icon.icon);
		else this.icons.delete(id);
		if (stored.connector.source.kind === 'catalog') return;
		this.connectors.set(id, {
			...stored,
			connector: {
				...stored.connector,
				logo:
					icon.kind === 'icon'
						? { kind: 'server_icon', connectorId: id, checksum: icon.icon.checksum }
						: { kind: 'monogram' }
			}
		});
	}

	async icon(id: ConnectorId): Promise<ConnectorIcon | undefined> {
		return this.icons.get(id);
	}

	async runTools(): Promise<readonly RunConnectorTool[]> {
		return [...this.toolRows].flatMap(([id, tools]) => {
			const { title, source } = this.require(id).connector;
			const connector: ConnectorCallLabel =
				source.kind === 'catalog'
					? { kind: 'catalog', catalogId: source.catalogId, title }
					: { kind: 'custom', title };
			return tools.map((tool) => ({ tool, connector }));
		});
	}

	async toolDistances(
		vector: readonly number[],
		names: readonly string[],
		model: string
	): Promise<readonly ToolDistance[]> {
		return names.flatMap((name) => {
			const stored = this.vectors.get(name);
			return stored && stored.model === model
				? [{ name, distance: 1 - cosine(vector, stored.vector) }]
				: [];
		});
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

const cosine = (left: readonly number[], right: readonly number[]): number => {
	const dot = left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
	const norm =
		Math.sqrt(left.reduce((sum, value) => sum + value * value, 0)) *
		Math.sqrt(right.reduce((sum, value) => sum + value * value, 0));
	return norm === 0 ? 0 : dot / norm;
};
