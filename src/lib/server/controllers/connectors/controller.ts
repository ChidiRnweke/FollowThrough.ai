import { ExternalServiceError, ValidationError } from '$lib/errors';
import {
	CONNECTOR_CATALOG,
	type AuthorizationCallback,
	type AuthorizationTarget,
	type CatalogConnectorId,
	type CatalogEntryView,
	type Connector,
	type ConnectorCredential,
	type ConnectorDetail,
	type ConnectorId,
	type ConnectorSlug,
	type ConnectorSource,
	type ConnectorTool,
	type ConnectorsOverview,
	type ConnectRequest,
	type ConnectStart,
	type AuthorizationChallenge,
	type ListedConnectorTool,
	type NamedSnapshotEntry,
	type ServerAccess,
	type SetConnectorToolPolicy
} from '$lib/models/connectors';
import type { AtomicOperation, DateTime } from '$lib/models/workspace';
import type { ConnectorToolEmbedding } from '$lib/server/services/agent/tools/tool-search';
import type {
	ConnectorAuthorizer,
	Registration
} from '$lib/server/services/connectors/authorization';
import type {
	ConnectorAuthorizationAttempts,
	ConnectorRegistry
} from '$lib/server/services/connectors/directory';
import type { ConnectorToolListing } from '$lib/server/services/connectors/servers';
import type { ConnectorToolPolicyRule } from '$lib/services/connectors/policy';

/**
 * A user's connectors: the remote MCP servers the agent can call (ADR 0049).
 * Connecting, signing in and reading a server's tools need the user, so none of
 * these operations is an agent tool.
 */
export interface ConnectorsController {
	catalog(): Promise<readonly CatalogEntryView[]>;
	list(): Promise<ConnectorsOverview>;
	get(id: ConnectorId): Promise<ConnectorDetail>;
	/** Connects at once, or answers with the authorization server to send the user to. */
	connect(request: ConnectRequest): Promise<ConnectStart>;
	/** Signs an OAuth connector in again, keeping its tools and their policies. */
	reconnect(id: ConnectorId): Promise<ConnectStart>;
	completeAuthorization(callback: AuthorizationCallback): Promise<ConnectorId>;
	refreshTools(id: ConnectorId): Promise<ConnectorDetail>;
	setToolPolicy(input: SetConnectorToolPolicy): Promise<ConnectorTool>;
	disconnect(id: ConnectorId): Promise<void>;
}

/** Connectors are on only where the deployment can seal credentials. */
export type ConnectorsSetup =
	| { readonly kind: 'unconfigured' }
	| {
			readonly kind: 'configured';
			readonly registry: ConnectorRegistry;
			readonly attempts: ConnectorAuthorizationAttempts;
			readonly authorizer: ConnectorAuthorizer;
			readonly servers: ConnectorToolListing;
			readonly embeddings: ConnectorToolEmbedding;
			/** Catalog entries whose preregistered client credentials this deployment configures. */
			readonly preregistered: ReadonlySet<CatalogConnectorId>;
			readonly transactionRunner: AtomicOperation;
			readonly now: () => DateTime;
	  };

export interface ConnectorsDependencies {
	readonly policy: ConnectorToolPolicyRule;
	readonly setup: ConnectorsSetup;
}

type Configured = Extract<ConnectorsSetup, { kind: 'configured' }>;

/** One minute covers a request's own latency and clock skew between hosts. */
const EXPIRY_MARGIN_MS = 60_000;

const catalogEntry = (id: CatalogConnectorId) => {
	const entry = CONNECTOR_CATALOG.find((candidate) => candidate.id === id);
	if (!entry) throw new ValidationError(`There is no catalog connector ${id}.`);
	return entry;
};

const registrationFor = (source: ConnectorSource): Registration => {
	if (source.kind === 'custom') return { kind: 'discovered' };
	const entry = catalogEntry(source.catalogId);
	return entry.authentication.kind === 'oauth' &&
		entry.authentication.registration === 'preregistered'
		? { kind: 'preregistered', catalogId: entry.id }
		: { kind: 'discovered' };
};

const hostOf = (serverUrl: string) => new URL(serverUrl).host;

const connected = (connectorId: ConnectorId): ConnectStart => ({ kind: 'connected', connectorId });

export class Connectors implements ConnectorsController {
	constructor(private readonly dependencies: ConnectorsDependencies) {}

	async catalog(): Promise<readonly CatalogEntryView[]> {
		const setup = this.dependencies.setup;
		const connected =
			setup.kind === 'configured'
				? new Map(
						(await setup.registry.list()).flatMap((connector) =>
							connector.source.kind === 'catalog'
								? [[connector.source.catalogId, connector.id] as const]
								: []
						)
					)
				: new Map<CatalogConnectorId, ConnectorId>();
		return CONNECTOR_CATALOG.map((entry): CatalogEntryView => {
			const connectorId = connected.get(entry.id);
			if (connectorId) return { entry, availability: { kind: 'connected', connectorId } };
			const unavailable =
				setup.kind === 'unconfigured' ||
				(entry.authentication.kind === 'oauth' &&
					entry.authentication.registration === 'preregistered' &&
					!setup.preregistered.has(entry.id));
			return { entry, availability: { kind: unavailable ? 'unconfigured' : 'available' } };
		});
	}

	async list(): Promise<ConnectorsOverview> {
		const setup = this.dependencies.setup;
		if (setup.kind === 'unconfigured') return { kind: 'unconfigured' };
		const [connectors, tools] = await Promise.all([
			setup.registry.list(),
			setup.registry.tools({ kind: 'all' })
		]);
		return {
			kind: 'ready',
			connectors: connectors.map((connector) => {
				const own = tools.filter((tool) => tool.connectorId === connector.id);
				const effective = own.map((tool) =>
					this.dependencies.policy.effective(tool.policy, tool.hints)
				);
				return {
					connector,
					tools: {
						total: own.length,
						unusable: own.filter((tool) => tool.schema.kind === 'unusable').length,
						asking: effective.filter((choice) => choice === 'ask').length,
						off: effective.filter((choice) => choice === 'off').length
					}
				};
			})
		};
	}

	async get(id: ConnectorId): Promise<ConnectorDetail> {
		const { registry } = this.configured();
		const connector = await registry.get(id);
		return { connector, tools: await registry.tools({ kind: 'connector', connectorId: id }) };
	}

	async connect(request: ConnectRequest): Promise<ConnectStart> {
		const setup = this.configured();
		if (request.kind === 'catalog') {
			const entry = catalogEntry(request.catalogId);
			const source: ConnectorSource = { kind: 'catalog', catalogId: entry.id };
			if (entry.authentication.kind === 'none') {
				const listing = await setup.servers.listTools(entry.serverUrl, { kind: 'anonymous' });
				if (listing.kind === 'unauthorized')
					throw new ExternalServiceError(
						`${entry.title} now asks for a sign-in FollowThrough does not know.`
					);
				return connected(
					await this.create(
						setup,
						source,
						entry.title,
						entry.serverUrl,
						{ kind: 'none' },
						listing.tools
					)
				);
			}
			// Fails before the redirect when the entry is already connected.
			await setup.registry.allocateSlug(source, entry.title);
			return this.authorize(
				setup,
				{ kind: 'new', source, title: entry.title },
				entry.serverUrl,
				registrationFor(source),
				undefined
			);
		}
		const source: ConnectorSource = { kind: 'custom' };
		if (request.authentication.kind === 'token') {
			const token = request.authentication.token;
			const listing = await setup.servers.listTools(request.serverUrl, { kind: 'bearer', token });
			if (listing.kind === 'unauthorized')
				throw new ValidationError(`${hostOf(request.serverUrl)} refused this access token.`);
			return connected(
				await this.create(
					setup,
					source,
					request.title,
					request.serverUrl,
					{ kind: 'bearer', token },
					listing.tools
				)
			);
		}
		const listing = await setup.servers.listTools(request.serverUrl, { kind: 'anonymous' });
		if (listing.kind === 'listed')
			return connected(
				await this.create(
					setup,
					source,
					request.title,
					request.serverUrl,
					{ kind: 'none' },
					listing.tools
				)
			);
		return this.authorize(
			setup,
			{ kind: 'new', source, title: request.title },
			request.serverUrl,
			{ kind: 'discovered' },
			listing.challenge
		);
	}

	async reconnect(id: ConnectorId): Promise<ConnectStart> {
		const setup = this.configured();
		const connector = await setup.registry.get(id);
		if (connector.authentication !== 'oauth')
			throw new ValidationError(
				`${connector.title} does not sign in with OAuth. Disconnect it and connect it again.`
			);
		return this.authorize(
			setup,
			{ kind: 'existing', connectorId: id },
			connector.serverUrl,
			registrationFor(connector.source),
			undefined
		);
	}

	async completeAuthorization(callback: AuthorizationCallback): Promise<ConnectorId> {
		const setup = this.configured();
		const pending = await setup.attempts.recall(callback.state);
		if (callback.outcome.kind === 'denied')
			throw new ValidationError(
				`The sign-in to ${hostOf(pending.serverUrl)} was not approved (${callback.outcome.error}).`
			);
		const tokens = await setup.authorizer.exchange(pending, callback.outcome.code, callback.issuer);
		const credential: ConnectorCredential = { kind: 'oauth', grant: pending.grant, tokens };
		const listing = await setup.servers.listTools(pending.serverUrl, {
			kind: 'bearer',
			token: tokens.accessToken
		});
		if (listing.kind === 'unauthorized')
			throw new ExternalServiceError(`${hostOf(pending.serverUrl)} refused its own new sign-in.`);
		if (pending.target.kind === 'new') {
			return this.create(
				setup,
				pending.target.source,
				pending.target.title,
				pending.serverUrl,
				credential,
				listing.tools
			);
		}
		const connector = await setup.registry.get(pending.target.connectorId);
		const snapshot = await this.snapshot(setup, connector, listing.tools);
		await setup.transactionRunner.run(async () => {
			await setup.registry.storeCredential(connector.id, credential);
			await setup.registry.replaceSnapshot(connector.id, snapshot);
		});
		return connector.id;
	}

	async refreshTools(id: ConnectorId): Promise<ConnectorDetail> {
		const setup = this.configured();
		const connector = await setup.registry.get(id);
		const tools = await this.listWithCredential(setup, connector);
		const snapshot = await this.snapshot(setup, connector, tools);
		await setup.transactionRunner.run(() => setup.registry.replaceSnapshot(id, snapshot));
		return this.get(id);
	}

	setToolPolicy(input: SetConnectorToolPolicy): Promise<ConnectorTool> {
		return this.configured().registry.setToolPolicy(
			input.connectorId,
			input.serverName,
			input.policy === 'default' ? { kind: 'default' } : { kind: 'chosen', choice: input.policy }
		);
	}

	disconnect(id: ConnectorId): Promise<void> {
		return this.configured().registry.remove(id);
	}

	private configured(): Configured {
		const setup = this.dependencies.setup;
		if (setup.kind === 'unconfigured')
			throw new ValidationError(
				'Connectors are not set up on this server. Its operator needs to set CONNECTOR_SECRET_KEYS.'
			);
		return setup;
	}

	private async create(
		setup: Configured,
		source: ConnectorSource,
		title: string,
		serverUrl: string,
		credential: { readonly kind: 'none' } | ConnectorCredential,
		tools: readonly ListedConnectorTool[]
	): Promise<ConnectorId> {
		const slug = await setup.registry.allocateSlug(source, title);
		const snapshot = await this.snapshot(setup, { slug, title }, tools);
		const connector = await setup.transactionRunner.run(() =>
			setup.registry.create({ slug, source, title, serverUrl, credential }, snapshot)
		);
		return connector.id;
	}

	private async authorize(
		setup: Configured,
		target: AuthorizationTarget,
		serverUrl: string,
		registration: Registration,
		challenge: AuthorizationChallenge | undefined
	): Promise<ConnectStart> {
		const start = await setup.authorizer.begin({ serverUrl, registration, challenge });
		await setup.attempts.remember(start.state, {
			target,
			serverUrl,
			grant: start.grant,
			codeVerifier: start.codeVerifier,
			redirectUri: start.redirectUri
		});
		return { kind: 'authorize', authorizationUrl: start.authorizationUrl };
	}

	/** Names the tools, then embeds the usable ones in the catalog's wording (ADR 0049). */
	private async snapshot(
		setup: Configured,
		connector: { readonly slug: ConnectorSlug; readonly title: string },
		tools: readonly ListedConnectorTool[]
	): Promise<readonly NamedSnapshotEntry[]> {
		const named = setup.registry.name(connector.slug, tools);
		const usable = named.filter((entry) => entry.tool.schema.kind === 'usable');
		if (usable.length === 0)
			return named.map((entry) => ({
				kind: 'unusable',
				tool: entry.tool,
				modelName: entry.modelName
			}));
		const { model, vectors } = await setup.embeddings.embedConnectorTools(
			usable.map((entry) => ({
				name: entry.modelName,
				description: `[${connector.title}] ${entry.tool.title}. ${entry.tool.description}`
			}))
		);
		const vectorOf = new Map(usable.map((entry, index) => [entry.modelName, vectors[index]!]));
		return named.map((entry): NamedSnapshotEntry => {
			const embedding = vectorOf.get(entry.modelName);
			return embedding
				? {
						kind: 'usable',
						tool: entry.tool,
						modelName: entry.modelName,
						embedding,
						embeddingModel: model
					}
				: { kind: 'unusable', tool: entry.tool, modelName: entry.modelName };
		});
	}

	/**
	 * Lists the server's tools with the stored credential: a token about to
	 * expire is renewed first, and a 401 renews once more. A connector whose
	 * server still refuses needs the user to sign in again.
	 */
	private async listWithCredential(
		setup: Configured,
		connector: Connector
	): Promise<readonly ListedConnectorTool[]> {
		const read = await setup.registry.credential(connector.id);
		if (read.kind === 'unreadable')
			throw new ValidationError(
				`${connector.title}'s sign-in was stored under a key this server no longer has. Disconnect it and connect it again.`
			);
		if (read.kind === 'none') {
			const listing = await setup.servers.listTools(connector.serverUrl, { kind: 'anonymous' });
			if (listing.kind === 'listed') return listing.tools;
			return this.refused(setup, connector);
		}
		let credential = read.credential;
		if (
			credential.kind === 'oauth' &&
			credential.tokens.expiry.kind === 'at' &&
			Date.parse(credential.tokens.expiry.at) - Date.parse(setup.now()) < EXPIRY_MARGIN_MS
		)
			credential = await this.renew(setup, connector, credential);
		const first = await setup.servers.listTools(connector.serverUrl, access(credential));
		if (first.kind === 'listed') return first.tools;
		if (credential.kind === 'bearer') return this.refused(setup, connector);
		const renewed = await this.renew(setup, connector, credential);
		const second = await setup.servers.listTools(connector.serverUrl, access(renewed));
		if (second.kind === 'listed') return second.tools;
		return this.refused(setup, connector);
	}

	private async renew(
		setup: Configured,
		connector: Connector,
		credential: Extract<ConnectorCredential, { kind: 'oauth' }>
	): Promise<ConnectorCredential> {
		if (credential.tokens.refresh.kind === 'unavailable') return this.refused(setup, connector);
		const renewal = await setup.authorizer.refresh(
			credential.grant,
			credential.tokens.refresh.refreshToken
		);
		if (renewal.kind === 'rejected') return this.refused(setup, connector);
		const renewed: ConnectorCredential = { ...credential, tokens: renewal.tokens };
		await setup.registry.storeCredential(connector.id, renewed);
		return renewed;
	}

	private async refused(setup: Configured, connector: Connector): Promise<never> {
		await setup.registry.requireReauthorization(
			connector.id,
			`${connector.title} no longer accepts FollowThrough's sign-in.`
		);
		throw new ExternalServiceError(
			connector.authentication === 'oauth'
				? `${connector.title} needs you to sign in again. Reconnect it in Settings → Connectors.`
				: `${connector.title} no longer accepts its access token. Disconnect it in Settings → Connectors and connect it again.`
		);
	}
}

const access = (credential: ConnectorCredential): ServerAccess =>
	credential.kind === 'bearer'
		? { kind: 'bearer', token: credential.token }
		: { kind: 'bearer', token: credential.tokens.accessToken };
