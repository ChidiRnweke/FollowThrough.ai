import { createHash, randomUUID } from 'node:crypto';
import { ConflictError, NotFoundError, ValidationError } from '$lib/errors';
import {
	CONNECTOR_CATALOG,
	type Connector,
	type ConnectorCredential,
	type ConnectorCredentialRead,
	type ConnectorIcon,
	type ConnectorId,
	type ConnectorSlug,
	type ConnectorSource,
	type ConnectorTool,
	type ConnectorToolName,
	type ConnectorToolPolicy,
	type ListedConnectorTool,
	type NamedSnapshotEntry,
	type NewConnector,
	type PendingAuthorization,
	type RunConnectorTool,
	type ToolScope
} from '$lib/models/connectors';
import type { DateTime } from '$lib/models/workspace';
import type { QueryVector, ToolDistance } from '$lib/models/agent/tool-index';
import type {
	ConnectorAuthorizationRepository,
	ConnectorRepository
} from '$lib/server/repositories/connectors';

/** A listed tool and the name the model will call it by. */
export interface NamedTool {
	readonly tool: ListedConnectorTool;
	readonly modelName: ConnectorToolName;
}

/** A connector to create; the directory assigns its id. */
export type ConnectorDraft = Omit<NewConnector, 'id'>;

/** The bound user's connectors and their stored tools. */
export interface ConnectorRegistry {
	list(): Promise<readonly Connector[]>;
	/** Throws NotFoundError when the user has no such connector. */
	get(id: ConnectorId): Promise<Connector>;
	tools(scope: ToolScope): Promise<readonly ConnectorTool[]>;
	credential(id: ConnectorId): Promise<ConnectorCredentialRead>;
	/** A slug no other connector of this user holds; a catalog entry connects at most once. */
	allocateSlug(source: ConnectorSource, title: string): Promise<ConnectorSlug>;
	name(slug: ConnectorSlug, tools: readonly ListedConnectorTool[]): readonly NamedTool[];
	create(connector: ConnectorDraft, snapshot: readonly NamedSnapshotEntry[]): Promise<Connector>;
	replaceSnapshot(id: ConnectorId, snapshot: readonly NamedSnapshotEntry[]): Promise<void>;
	storeCredential(id: ConnectorId, credential: ConnectorCredential): Promise<void>;
	requireReauthorization(id: ConnectorId, reason: string): Promise<void>;
	remove(id: ConnectorId): Promise<void>;
	setToolPolicy(
		id: ConnectorId,
		serverName: string,
		policy: ConnectorToolPolicy
	): Promise<ConnectorTool>;
	storeIcon(
		id: ConnectorId,
		icon: { readonly kind: 'icon'; readonly icon: ConnectorIcon } | { readonly kind: 'none' }
	): Promise<void>;
	icon(id: ConnectorId): Promise<ConnectorIcon | undefined>;
}

/** What the agent harness reads to offer connector tools and rank them (ADR 0049). */
export interface ConnectorToolSource {
	runTools(): Promise<readonly RunConnectorTool[]>;
	/**
	 * Distances from the query for the named tools. A tool without a vector from
	 * the query's model cannot be ranked, and search says which connector to
	 * refresh instead of leaving the tool out.
	 */
	distances(names: readonly string[], query: QueryVector): Promise<readonly ToolDistance[]>;
}

/** OAuth attempts between the redirect and the callback. */
export interface ConnectorAuthorizationAttempts {
	remember(state: string, pending: PendingAuthorization): Promise<void>;
	/** Takes the attempt once. Throws ValidationError for an unknown, used or expired state. */
	recall(state: string): Promise<PendingAuthorization>;
}

export interface ConnectorDirectoryDependencies {
	readonly connectors: ConnectorRepository;
	readonly authorizations: ConnectorAuthorizationRepository;
	readonly now: () => DateTime;
}

/** As long as the sign-in PKCE cookie lives (`setPkceCookie` in config.ts). */
const AUTHORIZATION_LIFETIME_MS = 600_000;
/** The tool part of a model name, after `<slug>__` (CONNECTOR_TOOL_NAME_PATTERN). */
const TOOL_PART_LENGTH = 46;
const SLUG_LENGTH = 16;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** The base itself when free, else the base shortened to fit the first free numeric suffix. */
const freeSlug = (base: string, taken: ReadonlySet<string>): ConnectorSlug => {
	if (!taken.has(base)) return base as ConnectorSlug;
	for (let suffix = 2; ; suffix++) {
		const candidate = `${base.slice(0, SLUG_LENGTH - String(suffix).length)}${suffix}`;
		if (!taken.has(candidate)) return candidate as ConnectorSlug;
	}
};

/**
 * The provider grammar allows letters, digits, `_` and `-` in 64 characters.
 * A server name that fits is kept as it is; any other is cleaned, shortened and
 * suffixed with its own hash, so the name is the same on every refresh and two
 * server names never share one.
 */
const modelToolName = (slug: ConnectorSlug, serverName: string): ConnectorToolName => {
	const clean = serverName.replace(/[^A-Za-z0-9_-]/g, '_');
	const part =
		clean === serverName && clean.length > 0 && clean.length <= TOOL_PART_LENGTH
			? clean
			: `${clean.slice(0, TOOL_PART_LENGTH - 7)}_${sha256(serverName).slice(0, 6)}`;
	return `${slug}__${part}` as ConnectorToolName;
};

export class ConnectorDirectory
	implements ConnectorRegistry, ConnectorAuthorizationAttempts, ConnectorToolSource
{
	constructor(private readonly dependencies: ConnectorDirectoryDependencies) {}

	private clock(): Date {
		return new Date(this.dependencies.now());
	}

	list(): Promise<readonly Connector[]> {
		return this.dependencies.connectors.list();
	}

	async get(id: ConnectorId): Promise<Connector> {
		const connector = await this.dependencies.connectors.find(id);
		if (!connector) throw new NotFoundError('Connector not found');
		return connector;
	}

	tools(scope: ToolScope): Promise<readonly ConnectorTool[]> {
		return this.dependencies.connectors.tools(scope);
	}

	credential(id: ConnectorId): Promise<ConnectorCredentialRead> {
		return this.dependencies.connectors.credential(id);
	}

	async allocateSlug(source: ConnectorSource, title: string): Promise<ConnectorSlug> {
		const existing = await this.dependencies.connectors.list();
		const used = new Set<string>(existing.map((connector) => connector.slug));
		if (source.kind === 'catalog') {
			if (
				existing.some(
					(connector) =>
						connector.source.kind === 'catalog' && connector.source.catalogId === source.catalogId
				)
			)
				throw new ConflictError(`${title} is already connected.`);
			// A custom server may hold this id as its slug from before the catalog listed the
			// vendor. Calls carry their own label (ADR 0051), so the slug need not be the id.
			return freeSlug(source.catalogId, used);
		}
		const base =
			title
				.toLowerCase()
				.replace(/[^a-z0-9]/g, '')
				.replace(/^[0-9]+/, '')
				.slice(0, SLUG_LENGTH) || 'server';
		return freeSlug(base, new Set([...used, ...CONNECTOR_CATALOG.map((entry) => entry.id)]));
	}

	name(slug: ConnectorSlug, tools: readonly ListedConnectorTool[]): readonly NamedTool[] {
		return tools.map((tool) => ({ tool, modelName: modelToolName(slug, tool.serverName) }));
	}

	async create(draft: ConnectorDraft, snapshot: readonly NamedSnapshotEntry[]): Promise<Connector> {
		const id = randomUUID() as ConnectorId;
		const created = await this.dependencies.connectors.insert({ id, ...draft }, this.clock());
		await this.dependencies.connectors.replaceTools(id, snapshot, this.clock());
		return created;
	}

	replaceSnapshot(id: ConnectorId, snapshot: readonly NamedSnapshotEntry[]): Promise<void> {
		return this.dependencies.connectors.replaceTools(id, snapshot, this.clock());
	}

	storeCredential(id: ConnectorId, credential: ConnectorCredential): Promise<void> {
		return this.dependencies.connectors.replaceCredential(id, credential);
	}

	requireReauthorization(id: ConnectorId, reason: string): Promise<void> {
		return this.dependencies.connectors.requireReauthorization(id, reason);
	}

	async remove(id: ConnectorId): Promise<void> {
		if (!(await this.dependencies.connectors.remove(id)))
			throw new NotFoundError('Connector not found');
	}

	async setToolPolicy(
		id: ConnectorId,
		serverName: string,
		policy: ConnectorToolPolicy
	): Promise<ConnectorTool> {
		const tool = await this.dependencies.connectors.setToolPolicy(id, serverName, policy);
		if (!tool) throw new NotFoundError('Connector tool not found');
		return tool;
	}

	runTools(): Promise<readonly RunConnectorTool[]> {
		return this.dependencies.connectors.runTools();
	}

	async distances(names: readonly string[], query: QueryVector): Promise<readonly ToolDistance[]> {
		const found = await this.dependencies.connectors.toolDistances(
			query.vector,
			names,
			query.model
		);
		const ranked = new Set(found.map((entry) => entry.name));
		const missing = names.filter((name) => !ranked.has(name));
		if (missing.length > 0)
			throw new ValidationError(
				`Tool search has no current index for ${missing.join(', ')}. Ask the user to refresh those connectors in Settings → Connectors.`
			);
		return found;
	}

	storeIcon(
		id: ConnectorId,
		icon: { readonly kind: 'icon'; readonly icon: ConnectorIcon } | { readonly kind: 'none' }
	): Promise<void> {
		return this.dependencies.connectors.storeIcon(id, icon);
	}

	icon(id: ConnectorId): Promise<ConnectorIcon | undefined> {
		return this.dependencies.connectors.icon(id);
	}

	remember(state: string, pending: PendingAuthorization): Promise<void> {
		return this.dependencies.authorizations.insert(
			sha256(state),
			pending,
			new Date(this.clock().getTime() + AUTHORIZATION_LIFETIME_MS)
		);
	}

	async recall(state: string): Promise<PendingAuthorization> {
		const taken = await this.dependencies.authorizations.take(sha256(state), this.clock());
		if (taken.kind === 'expired')
			throw new ValidationError('This sign-in took too long and expired. Connect again.');
		if (taken.kind === 'missing')
			throw new ValidationError('This sign-in is not one this account started. Connect again.');
		return taken.request;
	}
}
