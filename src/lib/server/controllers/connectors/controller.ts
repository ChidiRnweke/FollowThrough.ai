import { ExternalServiceError, NotFoundError, ValidationError } from '$lib/errors';
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
	type ConnectorCallOutcome,
	type ConnectorIcon,
	type ConnectorToolCall,
	type ConnectorToolResult,
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
import type {
	ConnectorToolCalling,
	ConnectorToolListing,
	ToolListing
} from '$lib/server/services/connectors/servers';
import type { ConnectorIconFetching } from '$lib/server/services/connectors/icons';
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
	/**
	 * Calls one connector tool for the agent. The tool must still match the
	 * snapshot the run was offered, and the connector must still accept its
	 * sign-in; otherwise nothing is sent and the outcome says why.
	 */
	callTool(call: ConnectorToolCall, signal: AbortSignal): Promise<ConnectorCallOutcome>;
	/** A custom connector's stored server icon, served from this origin. */
	icon(id: ConnectorId): Promise<ConnectorIcon>;
}

/** Connectors are on only where the deployment can seal credentials. */
export type ConnectorsSetup =
	| { readonly kind: 'unconfigured' }
	| {
			readonly kind: 'configured';
			readonly registry: ConnectorRegistry;
			readonly attempts: ConnectorAuthorizationAttempts;
			readonly authorizer: ConnectorAuthorizer;
			readonly servers: ConnectorToolListing & ConnectorToolCalling;
			readonly icons: ConnectorIconFetching;
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
				// An unusable tool is never offered, so it neither asks nor is off: it counts once.
				const effective = own
					.filter((tool) => tool.schema.kind === 'usable')
					.map((tool) => this.dependencies.policy.effective(tool.policy, tool.hints));
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
		const tools = await registry.tools({ kind: 'connector', connectorId: id });
		return {
			connector,
			tools: tools.map((tool) => ({
				tool,
				effective: this.dependencies.policy.effective(tool.policy, tool.hints)
			}))
		};
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
					await this.create(setup, source, entry.title, entry.serverUrl, { kind: 'none' }, listing)
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
					listing
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
					listing
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
				listing
			);
		}
		const connector = await setup.registry.get(pending.target.connectorId);
		const snapshot = await this.snapshot(setup, connector, listing.tools);
		await setup.transactionRunner.run(async () => {
			await setup.registry.storeCredential(connector.id, credential);
			await setup.registry.replaceSnapshot(connector.id, snapshot);
		});
		await this.refreshIcon(
			setup,
			connector.id,
			connector.source,
			connector.serverUrl,
			listing.icons
		);
		return connector.id;
	}

	async refreshTools(id: ConnectorId): Promise<ConnectorDetail> {
		const setup = this.configured();
		const connector = await setup.registry.get(id);
		const listing = await this.listWithCredential(setup, connector);
		const snapshot = await this.snapshot(setup, connector, listing.tools);
		await setup.transactionRunner.run(() => setup.registry.replaceSnapshot(id, snapshot));
		await this.refreshIcon(setup, id, connector.source, connector.serverUrl, listing.icons);
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

	async icon(id: ConnectorId): Promise<ConnectorIcon> {
		const icon = await this.configured().registry.icon(id);
		if (!icon) throw new NotFoundError('This connector has no stored icon');
		return icon;
	}

	async callTool(call: ConnectorToolCall, signal: AbortSignal): Promise<ConnectorCallOutcome> {
		const setup = this.configured();
		const connector = await setup.registry.get(call.connectorId);
		const tool = (
			await setup.registry.tools({ kind: 'connector', connectorId: connector.id })
		).find((candidate) => candidate.serverName === call.serverName);
		if (!tool || tool.checksum !== call.checksum)
			return {
				kind: 'withdrawn',
				reason: `${connector.title} changed this tool after the run was offered it, so nothing ran.`
			};
		if (this.dependencies.policy.effective(tool.policy, tool.hints) === 'off')
			return {
				kind: 'withdrawn',
				reason: `This ${connector.title} tool is turned off, so nothing ran.`
			};
		if (connector.status.kind !== 'connected')
			return { kind: 'reauthorization_required', connectorTitle: connector.title };
		const calling = await this.withAccess(
			setup,
			connector,
			async (access): Promise<Attempt<ConnectorToolResult>> => {
				const answer = await setup.servers.callTool(
					connector.serverUrl,
					access,
					{ serverName: call.serverName, arguments: call.arguments, callId: call.callId },
					signal
				);
				return answer.kind === 'returned'
					? { kind: 'answered', value: answer.result }
					: { kind: 'unauthorized' };
			}
		);
		if (calling.kind === 'refused')
			return { kind: 'reauthorization_required', connectorTitle: connector.title };
		return { kind: 'returned', connectorTitle: connector.title, result: calling.value };
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
		listing: ServerListing
	): Promise<ConnectorId> {
		const slug = await setup.registry.allocateSlug(source, title);
		const snapshot = await this.snapshot(setup, { slug, title }, listing.tools);
		const connector = await setup.transactionRunner.run(() =>
			setup.registry.create({ slug, source, title, serverUrl, credential }, snapshot)
		);
		await this.refreshIcon(setup, connector.id, source, serverUrl, listing.icons);
		return connector.id;
	}

	/**
	 * A custom server's own icon, fetched after its connector is stored. A catalog
	 * connector shows its recorded mark instead, and a server whose icons are all
	 * refused shows a monogram: the icon is the connector's face, not its function.
	 */
	private async refreshIcon(
		setup: Configured,
		id: ConnectorId,
		source: ConnectorSource,
		serverUrl: string,
		icons: ServerListing['icons']
	): Promise<void> {
		if (source.kind === 'catalog') return;
		const fetched = await setup.icons.fetch(serverUrl, icons);
		await setup.registry.storeIcon(id, fetched.kind === 'icon' ? fetched : { kind: 'none' });
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

	/** Lists the server's tools with the stored credential; a refused sign-in fails the refresh. */
	private async listWithCredential(
		setup: Configured,
		connector: Connector
	): Promise<ServerListing> {
		const listing = await this.withAccess(
			setup,
			connector,
			async (access): Promise<Attempt<ServerListing>> => {
				const answer = await setup.servers.listTools(connector.serverUrl, access);
				return answer.kind === 'listed'
					? { kind: 'answered', value: { tools: answer.tools, icons: answer.icons } }
					: { kind: 'unauthorized' };
			}
		);
		if (listing.kind === 'answered') return listing.value;
		throw new ExternalServiceError(refusal(connector));
	}

	/**
	 * Runs `attempt` with the stored credential. A token about to expire is
	 * renewed first, and a 401 renews once more. When the service still refuses,
	 * the connector moves to `reauthorization_required` and the answer is
	 * `refused`, so the caller decides how to report it.
	 */
	private async withAccess<Value>(
		setup: Configured,
		connector: Connector,
		attempt: (access: ServerAccess) => Promise<Attempt<Value>>
	): Promise<Access<Value>> {
		const read = await setup.registry.credential(connector.id);
		if (read.kind === 'unreadable') return this.refused(setup, connector);
		if (read.kind === 'none') {
			const answer = await attempt({ kind: 'anonymous' });
			return answer.kind === 'unauthorized' ? this.refused(setup, connector) : answer;
		}
		let credential = read.credential;
		if (
			credential.kind === 'oauth' &&
			credential.tokens.expiry.kind === 'at' &&
			Date.parse(credential.tokens.expiry.at) - Date.parse(setup.now()) < EXPIRY_MARGIN_MS
		) {
			const renewed = await this.renew(setup, connector, credential);
			if (renewed.kind === 'refused') return renewed;
			credential = renewed.credential;
		}
		const first = await attempt(access(credential));
		if (first.kind === 'answered') return first;
		if (credential.kind === 'bearer') return this.refused(setup, connector);
		const renewed = await this.renew(setup, connector, credential);
		if (renewed.kind === 'refused') return renewed;
		const second = await attempt(access(renewed.credential));
		return second.kind === 'answered' ? second : this.refused(setup, connector);
	}

	private async renew(
		setup: Configured,
		connector: Connector,
		credential: Extract<ConnectorCredential, { kind: 'oauth' }>
	): Promise<
		| { readonly kind: 'renewed'; readonly credential: ConnectorCredential }
		| { readonly kind: 'refused' }
	> {
		if (credential.tokens.refresh.kind === 'unavailable') return this.refused(setup, connector);
		const renewal = await setup.authorizer.refresh(
			credential.grant,
			credential.tokens.refresh.refreshToken
		);
		if (renewal.kind === 'rejected') return this.refused(setup, connector);
		const renewed: ConnectorCredential = { ...credential, tokens: renewal.tokens };
		await setup.registry.storeCredential(connector.id, renewed);
		return { kind: 'renewed', credential: renewed };
	}

	private async refused(
		setup: Configured,
		connector: Connector
	): Promise<{ readonly kind: 'refused' }> {
		await setup.registry.requireReauthorization(
			connector.id,
			`${connector.title} no longer accepts FollowThrough's sign-in.`
		);
		return { kind: 'refused' };
	}
}

/** What a server listed: its tools and the icons it published. */
type ServerListing = Omit<Extract<ToolListing, { kind: 'listed' }>, 'kind'>;

/** One request with a credential: the service answered, or it refused the credential. */
type Attempt<Value> =
	{ readonly kind: 'answered'; readonly value: Value } | { readonly kind: 'unauthorized' };

/** After renewal: the service answered, or the user has to sign in again. */
type Access<Value> =
	{ readonly kind: 'answered'; readonly value: Value } | { readonly kind: 'refused' };

const refusal = (connector: Connector): string =>
	connector.authentication === 'oauth'
		? `${connector.title} needs you to sign in again. Reconnect it in Settings → Connectors.`
		: `${connector.title} no longer accepts its access token. Disconnect it in Settings → Connectors and connect it again.`;

const access = (credential: ConnectorCredential): ServerAccess =>
	credential.kind === 'bearer'
		? { kind: 'bearer', token: credential.token }
		: { kind: 'bearer', token: credential.tokens.accessToken };
