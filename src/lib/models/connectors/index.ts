/**
 * Connectors: a user's connections to remote MCP servers (ADR 0049).
 *
 * "MCP" elsewhere in this codebase means FollowThrough's own server for other
 * hosts. A connector is the other direction: FollowThrough calls a server that
 * someone else runs, with a credential that belongs to one user.
 */
import { z } from 'zod';
import type { AgentPayloadObject } from '$lib/models/agent/payload';
import { RECORDED_CATALOG } from '$lib/models/connector-catalog';

type Brand<T, Name extends string> = T & { readonly __brand: Name };
type DateTime = Brand<string, 'DateTime'>;

export type ConnectorId = Brand<string, 'ConnectorId'>;
/**
 * A connector's short name, unique per user. It has no underscore, so the first
 * `__` in a connector tool name ends the slug.
 */
export type ConnectorSlug = Brand<string, 'ConnectorSlug'>;
/** `<slug>__<tool>`: the name the model calls. It fits the provider grammar `^[a-zA-Z0-9_-]{1,64}$`. */
export type ConnectorToolName = Brand<string, 'ConnectorToolName'>;

export const CONNECTOR_SLUG_PATTERN = /^[a-z][a-z0-9]{0,15}$/;
export const CONNECTOR_TOOL_NAME_PATTERN = /^[a-z][a-z0-9]{0,15}__[A-Za-z0-9_-]{1,46}$/;

export const connectorIdSchema = z.uuid().transform((value) => value as ConnectorId);
export const connectorSlugSchema = z
	.string()
	.regex(CONNECTOR_SLUG_PATTERN)
	.transform((value) => value as ConnectorSlug);
export const connectorToolNameSchema = z
	.string()
	.regex(CONNECTOR_TOOL_NAME_PATTERN)
	.transform((value) => value as ConnectorToolName);

/**
 * How a catalog server authenticates. `discovered` registers a client from the
 * server's own metadata (a client ID metadata document, else dynamic
 * registration); `preregistered` needs client credentials that the operator
 * configured for this entry.
 */
export type CatalogAuthentication =
	| { readonly kind: 'none' }
	| { readonly kind: 'oauth'; readonly registration: 'discovered' | 'preregistered' };

/** How the catalog groups its services, as `scripts/connector-catalog-sources.ts` assigns them. */
export type ConnectorCategory =
	| 'work'
	| 'documents'
	| 'engineering'
	| 'monitoring'
	| 'customers'
	| 'finance'
	| 'automation'
	| 'research';

export interface CatalogConnector {
	readonly id: string;
	readonly title: string;
	readonly description: string;
	readonly category: ConnectorCategory;
	readonly serverUrl: string;
	readonly authentication: CatalogAuthentication;
	/** The vendor's mark in `static/connector-logos/`, and where the recorder found it. */
	readonly logo: { readonly file: string; readonly source: string };
	/** Why the endpoint is the vendor's own: its registry name, or the vendor page that names it. */
	readonly provenance:
		| { readonly kind: 'registry'; readonly name: string }
		| { readonly kind: 'documented'; readonly documentation: string };
}

/**
 * The hosted servers a user can connect from the catalog, recorded and checked
 * by `scripts/record-connector-catalog.ts` (ADR 0051).
 */
export const CONNECTOR_CATALOG = RECORDED_CATALOG satisfies readonly CatalogConnector[];

/** One catalog entry, with its id narrowed to the catalog's own. */
export type CatalogEntry = (typeof CONNECTOR_CATALOG)[number];

export type CatalogConnectorId = CatalogEntry['id'];

export const catalogConnectorIdSchema = z.enum(
	CONNECTOR_CATALOG.map((entry) => entry.id) as [CatalogConnectorId, ...CatalogConnectorId[]]
);

export type ConnectorSource =
	| { readonly kind: 'catalog'; readonly catalogId: CatalogConnectorId }
	| { readonly kind: 'custom' };

export type ConnectorAuthenticationKind = 'none' | 'bearer' | 'oauth';

export const connectorAuthenticationKindSchema = z.enum(['none', 'bearer', 'oauth']);

export type ConnectorStatus =
	| { readonly kind: 'connected' }
	| {
			readonly kind: 'reauthorization_required';
			readonly reason: string;
			readonly since: DateTime;
	  }
	/** Its credential was sealed under a key this deployment no longer holds. */
	| { readonly kind: 'unreadable' };

/**
 * Which logo a connector shows. A catalog entry shows the vendor's mark from
 * the recorded static files; a custom server shows the icon it published, once
 * fetched and checked; otherwise a monogram of its title (ADR 0049).
 */
export type ConnectorLogo =
	| { readonly kind: 'catalog'; readonly catalogId: CatalogConnectorId }
	| {
			readonly kind: 'server_icon';
			/** The connector whose stored icon this is; the checksum versions its URL. */
			readonly connectorId: ConnectorId;
			readonly checksum: string;
	  }
	| { readonly kind: 'monogram' };

/** A stored connector, without its credential. */
export interface Connector {
	readonly id: ConnectorId;
	readonly slug: ConnectorSlug;
	readonly source: ConnectorSource;
	readonly title: string;
	readonly serverUrl: string;
	readonly authentication: ConnectorAuthenticationKind;
	readonly status: ConnectorStatus;
	readonly logo: ConnectorLogo;
	readonly toolsRefreshedAt: DateTime;
	readonly createdAt: DateTime;
}

/** An icon a server listed in its `serverInfo` (MCP 2025-11-25), not yet fetched or trusted. */
export interface ServerIcon {
	readonly src: string;
	readonly mimeType: string | undefined;
	readonly theme: 'light' | 'dark' | undefined;
}

/** A server icon after it was fetched and its bytes identified. */
export interface ConnectorIcon {
	readonly mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml';
	readonly bytes: Uint8Array;
	readonly checksum: string;
}

export const connectorIconMediaTypeSchema = z.enum([
	'image/png',
	'image/jpeg',
	'image/webp',
	'image/svg+xml'
]);

// --- Credentials (sealed at rest) -------------------------------------------

/** The authorization server endpoints a grant needs after discovery. */
export interface AuthorizationServer {
	readonly issuer: string;
	readonly authorizationEndpoint: string;
	readonly tokenEndpoint: string;
	/** `token_endpoint_auth_methods_supported`, as the server advertised it. */
	readonly tokenAuthMethods: readonly string[];
	/** Whether the server returns `iss` on the authorization response (RFC 9207). */
	readonly issuerInResponse: boolean;
}

export type OAuthClient =
	/** Our client ID metadata document URL is the client id. */
	| { readonly kind: 'metadata_document'; readonly clientId: string }
	| { readonly kind: 'dynamic_public'; readonly clientId: string }
	| {
			readonly kind: 'dynamic_confidential';
			readonly clientId: string;
			readonly clientSecret: string;
			readonly method: 'client_secret_basic' | 'client_secret_post';
	  }
	/** Client credentials come from the deployment's configuration at use time. */
	| { readonly kind: 'preregistered'; readonly catalogId: CatalogConnectorId };

export interface OAuthGrant {
	readonly authorizationServer: AuthorizationServer;
	/** The RFC 8707 resource indicator: the server's canonical URI. */
	readonly resource: string;
	/** Scopes requested at authorization; empty when the server named none. */
	readonly scopes: readonly string[];
	readonly client: OAuthClient;
}

export type TokenExpiry =
	{ readonly kind: 'at'; readonly at: DateTime } | { readonly kind: 'unstated' };

export type TokenRefresh =
	{ readonly kind: 'available'; readonly refreshToken: string } | { readonly kind: 'unavailable' };

export interface OAuthTokens {
	readonly accessToken: string;
	readonly expiry: TokenExpiry;
	readonly refresh: TokenRefresh;
}

export type ConnectorCredential =
	| { readonly kind: 'bearer'; readonly token: string }
	| { readonly kind: 'oauth'; readonly grant: OAuthGrant; readonly tokens: OAuthTokens };

/** What a stored credential reads as: a key this deployment lacks is a state, not a crash. */
export type ConnectorCredentialRead =
	| { readonly kind: 'none' }
	| { readonly kind: 'readable'; readonly credential: ConnectorCredential }
	| { readonly kind: 'unreadable' };

const dateTimeSchema = z.iso.datetime({ offset: true }).transform((value) => value as DateTime);

const authorizationServerSchema = z.object({
	issuer: z.string(),
	authorizationEndpoint: z.string(),
	tokenEndpoint: z.string(),
	tokenAuthMethods: z.array(z.string()),
	issuerInResponse: z.boolean()
});

const oauthClientSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('metadata_document'), clientId: z.string() }),
	z.object({ kind: z.literal('dynamic_public'), clientId: z.string() }),
	z.object({
		kind: z.literal('dynamic_confidential'),
		clientId: z.string(),
		clientSecret: z.string(),
		method: z.enum(['client_secret_basic', 'client_secret_post'])
	}),
	z.object({ kind: z.literal('preregistered'), catalogId: catalogConnectorIdSchema })
]);

const oauthGrantSchema = z.object({
	authorizationServer: authorizationServerSchema,
	resource: z.string(),
	scopes: z.array(z.string()),
	client: oauthClientSchema
});

const oauthTokensSchema = z.object({
	accessToken: z.string(),
	expiry: z.discriminatedUnion('kind', [
		z.object({ kind: z.literal('at'), at: dateTimeSchema }),
		z.object({ kind: z.literal('unstated') })
	]),
	refresh: z.discriminatedUnion('kind', [
		z.object({ kind: z.literal('available'), refreshToken: z.string() }),
		z.object({ kind: z.literal('unavailable') })
	])
});

/** Reads a credential after it is unsealed. */
export const connectorCredentialSchema: z.ZodType<ConnectorCredential> = z.discriminatedUnion(
	'kind',
	[
		z.object({ kind: z.literal('bearer'), token: z.string().min(1) }),
		z.object({ kind: z.literal('oauth'), grant: oauthGrantSchema, tokens: oauthTokensSchema })
	]
);

/** Authorization server metadata fields the MCP SDK's types leave out. */
export const authorizationServerExtensionsSchema = z.object({
	/** RFC 9207: the server sends `iss` on every authorization response. */
	authorization_response_iss_parameter_supported: z.boolean().optional()
});

// --- Pending authorization ---------------------------------------------------

export type AuthorizationTarget =
	| { readonly kind: 'new'; readonly source: ConnectorSource; readonly title: string }
	| { readonly kind: 'existing'; readonly connectorId: ConnectorId };

/** One OAuth attempt between the redirect to the authorization server and its callback. */
export interface PendingAuthorization {
	readonly target: AuthorizationTarget;
	readonly serverUrl: string;
	readonly grant: OAuthGrant;
	readonly codeVerifier: string;
	readonly redirectUri: string;
}

export const connectorSourceSchema: z.ZodType<ConnectorSource> = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('catalog'), catalogId: catalogConnectorIdSchema }),
	z.object({ kind: z.literal('custom') })
]);

/** Reads a pending authorization after it is unsealed. */
export const pendingAuthorizationSchema: z.ZodType<PendingAuthorization> = z.object({
	target: z.discriminatedUnion('kind', [
		z.object({ kind: z.literal('new'), source: connectorSourceSchema, title: z.string() }),
		z.object({ kind: z.literal('existing'), connectorId: connectorIdSchema })
	]),
	serverUrl: z.string(),
	grant: oauthGrantSchema,
	codeVerifier: z.string(),
	redirectUri: z.string()
});

// --- Tools ------------------------------------------------------------------

/**
 * A tool's MCP annotations, with the specification's defaults applied where the
 * server left one out: not read-only, destructive, not idempotent, open world.
 */
export interface ConnectorToolHints {
	readonly readOnly: boolean;
	readonly destructive: boolean;
	readonly idempotent: boolean;
	readonly openWorld: boolean;
}

export const connectorToolHintsSchema: z.ZodType<ConnectorToolHints> = z.object({
	readOnly: z.boolean(),
	destructive: z.boolean(),
	idempotent: z.boolean(),
	openWorld: z.boolean()
});

export type ConnectorToolSchema =
	/** A JSON Schema object, kept as the server wrote it. */
	| { readonly kind: 'usable'; readonly inputSchema: AgentPayloadObject }
	| { readonly kind: 'unusable'; readonly reason: string };

export type ConnectorToolPolicyChoice = 'allow' | 'ask' | 'off';

export type ConnectorToolPolicy =
	/** Follows the tool's hints, through the shared policy rule. */
	| { readonly kind: 'default' }
	| { readonly kind: 'chosen'; readonly choice: ConnectorToolPolicyChoice };

export const connectorToolPolicyChoiceSchema = z.enum(['allow', 'ask', 'off']);

/** A tool as the server listed it, parsed. The snapshot stores one per server tool. */
export interface ListedConnectorTool {
	readonly serverName: string;
	readonly title: string;
	readonly description: string;
	readonly schema: ConnectorToolSchema;
	readonly hints: ConnectorToolHints;
	/** Hash of everything above: approval binds to it (ADR 0049). */
	readonly checksum: string;
}

export interface ConnectorTool extends ListedConnectorTool {
	readonly connectorId: ConnectorId;
	readonly modelName: ConnectorToolName;
	readonly policy: ConnectorToolPolicy;
}

/** One tool of a snapshot, ready to store: the vector exists only for a usable tool. */
export type ConnectorToolSnapshotEntry =
	| {
			readonly kind: 'usable';
			readonly tool: ListedConnectorTool;
			readonly embedding: readonly number[];
			readonly embeddingModel: string;
	  }
	| { readonly kind: 'unusable'; readonly tool: ListedConnectorTool };

// --- Requests and views -----------------------------------------------------

export type CustomAuthentication =
	/** Probe the server: no challenge means no authentication, a challenge means OAuth. */
	{ readonly kind: 'discover' } | { readonly kind: 'token'; readonly token: string };

export type ConnectRequest =
	| { readonly kind: 'catalog'; readonly catalogId: CatalogConnectorId }
	| {
			readonly kind: 'custom';
			readonly serverUrl: string;
			readonly title: string;
			readonly authentication: CustomAuthentication;
	  };

export const connectRequestSchema: z.ZodType<ConnectRequest> = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('catalog'), catalogId: catalogConnectorIdSchema }),
	z.object({
		kind: z.literal('custom'),
		serverUrl: z.url({ protocol: /^https$/ }),
		title: z.string().trim().min(1).max(80),
		authentication: z.discriminatedUnion('kind', [
			z.object({ kind: z.literal('discover') }),
			z.object({ kind: z.literal('token'), token: z.string().trim().min(1) })
		])
	})
]);

export interface AuthorizationCallback {
	readonly state: string;
	/** The `iss` response parameter, which only some servers send (RFC 9207). */
	readonly issuer: string | undefined;
	readonly outcome:
		| { readonly kind: 'code'; readonly code: string }
		| { readonly kind: 'denied'; readonly error: string; readonly description: string | undefined };
}

const callbackState = { state: z.string().min(1), iss: z.string().min(1).optional() };

/** Reads the query of a redirect back from the authorization server. */
export const authorizationCallbackSchema: z.ZodType<AuthorizationCallback> = z.union([
	z
		.object({ ...callbackState, code: z.string().min(1), error: z.undefined() })
		.transform((query): AuthorizationCallback => ({
			state: query.state,
			issuer: query.iss,
			outcome: { kind: 'code', code: query.code }
		})),
	z
		.object({
			...callbackState,
			code: z.undefined(),
			error: z.string().min(1),
			error_description: z.string().optional()
		})
		.transform((query): AuthorizationCallback => ({
			state: query.state,
			issuer: query.iss,
			outcome: { kind: 'denied', error: query.error, description: query.error_description }
		}))
]);

export type ConnectStart =
	| { readonly kind: 'authorize'; readonly authorizationUrl: string }
	| { readonly kind: 'connected'; readonly connectorId: ConnectorId };

export interface ConnectorToolCounts {
	readonly total: number;
	readonly unusable: number;
	readonly asking: number;
	readonly off: number;
}

export interface ConnectorSummary {
	readonly connector: Connector;
	readonly tools: ConnectorToolCounts;
}

export type ConnectorsOverview =
	/** The deployment has no `CONNECTOR_SECRET_KEYS`, so no credential can be stored. */
	| { readonly kind: 'unconfigured' }
	| { readonly kind: 'ready'; readonly connectors: readonly ConnectorSummary[] };

/** A stored tool beside what it does when the agent calls it, after the policy rule. */
export interface ConnectorToolView {
	readonly tool: ConnectorTool;
	readonly effective: ConnectorToolPolicyChoice;
}

export interface ConnectorDetail {
	readonly connector: Connector;
	readonly tools: readonly ConnectorToolView[];
}

export type CatalogAvailability =
	| { readonly kind: 'available' }
	| { readonly kind: 'connected'; readonly connectorId: ConnectorId };

export interface CatalogEntryView {
	readonly entry: CatalogEntry;
	readonly availability: CatalogAvailability;
}

export const setConnectorToolPolicySchema = z.object({
	connectorId: connectorIdSchema,
	serverName: z.string().min(1),
	policy: z.union([connectorToolPolicyChoiceSchema, z.literal('default')])
});
export type SetConnectorToolPolicy = z.infer<typeof setConnectorToolPolicySchema>;

/** Where the OAuth redirect lands, under the deployment's origin. */
export const connectorCallbackPath = '/connectors/callback';
/** Where FollowThrough publishes its client ID metadata document. */
export const connectorClientMetadataPath = '/oauth/client-metadata.json';

/**
 * FollowThrough's OAuth client registration, as dynamic registration sends it
 * and the client ID metadata document publishes it. A public client: PKCE
 * protects the code, so there is no secret to keep.
 */
export const connectorClientRegistration = (clientUri: string, redirectUri: string) => ({
	client_name: 'FollowThrough',
	client_uri: clientUri,
	redirect_uris: [redirectUri],
	grant_types: ['authorization_code', 'refresh_token'],
	response_types: ['code'],
	token_endpoint_auth_method: 'none'
});

// --- Storage shapes ---------------------------------------------------------

export type StoredCredential = { readonly kind: 'none' } | ConnectorCredential;

/** A connector to store. The id is chosen first because the credential is sealed to it. */
export interface NewConnector {
	readonly id: ConnectorId;
	readonly slug: ConnectorSlug;
	readonly source: ConnectorSource;
	readonly title: string;
	readonly serverUrl: string;
	readonly credential: StoredCredential;
}

/** One tool of a snapshot with the name the model will call it by. */
export type NamedSnapshotEntry = ConnectorToolSnapshotEntry & {
	readonly modelName: ConnectorToolName;
};

export type ToolScope =
	{ readonly kind: 'all' } | { readonly kind: 'connector'; readonly connectorId: ConnectorId };

/** What a 401 response asked for, from its `WWW-Authenticate` header. */
export interface AuthorizationChallenge {
	readonly resourceMetadataUrl: string | undefined;
	readonly scope: string | undefined;
}

/** How a request to a connector's server authenticates. */
export type ServerAccess =
	{ readonly kind: 'anonymous' } | { readonly kind: 'bearer'; readonly token: string };

// --- Calls ------------------------------------------------------------------

/**
 * How a call names its connector, frozen when the call is made (ADR 0049). A
 * transcript keeps naming the service after the connector is renamed or
 * removed, and a custom server never borrows a vendor's mark because its slug
 * later became a catalog id (ADR 0051).
 */
export type ConnectorCallLabel =
	| { readonly kind: 'catalog'; readonly catalogId: CatalogConnectorId; readonly title: string }
	| { readonly kind: 'custom'; readonly title: string };

/**
 * Reads a stored label. A catalog id the catalog no longer lists has no recorded
 * mark, so it reads as custom: the title stays, the vendor's logo does not.
 */
export const connectorCallLabelSchema: z.ZodType<ConnectorCallLabel> = z.union([
	z
		.object({ kind: z.literal('catalog'), catalogId: z.string(), title: z.string().min(1) })
		.transform((label): ConnectorCallLabel => {
			const catalogId = catalogConnectorIdSchema.safeParse(label.catalogId);
			return catalogId.success
				? { kind: 'catalog', catalogId: catalogId.data, title: label.title }
				: { kind: 'custom', title: label.title };
		}),
	z.object({ kind: z.literal('custom'), title: z.string().min(1) })
]);

/** A connector tool the agent can be offered this run, with the connector it belongs to. */
export interface RunConnectorTool {
	readonly tool: ConnectorTool;
	readonly connector: ConnectorCallLabel;
}

/** One block of what a server returned, parsed at the boundary (ADR 0037). */
export type ConnectorContent =
	| { readonly kind: 'text'; readonly text: string }
	/** Chat Completions accepts only text tool output, so the model reads what was omitted. */
	| {
			readonly kind: 'binary';
			readonly media: 'image' | 'audio';
			readonly mimeType: string;
			readonly byteSize: number;
	  }
	| {
			readonly kind: 'resource_link';
			readonly uri: string;
			readonly name: string;
			readonly mimeType: string | undefined;
	  }
	| {
			readonly kind: 'resource';
			readonly uri: string;
			readonly mimeType: string | undefined;
			readonly body:
				| { readonly kind: 'text'; readonly text: string }
				| { readonly kind: 'blob'; readonly byteSize: number };
	  };

export type StructuredContent =
	{ readonly kind: 'present'; readonly value: AgentPayloadObject } | { readonly kind: 'absent' };

export interface ConnectorToolResult {
	readonly content: readonly ConnectorContent[];
	readonly structured: StructuredContent;
	/** The server ran the tool and says it failed; the content says why. */
	readonly isError: boolean;
}

export interface ConnectorToolCall {
	readonly connectorId: ConnectorId;
	readonly serverName: string;
	/** The snapshot the tool was offered from; a changed tool runs nothing. */
	readonly checksum: string;
	readonly arguments: AgentPayloadObject;
	/** The model's call id, sent to the server in `_meta`. */
	readonly callId: string | undefined;
}

export type ConnectorCallOutcome =
	| {
			readonly kind: 'returned';
			readonly connectorTitle: string;
			readonly result: ConnectorToolResult;
	  }
	/** The service refused the stored sign-in, and only the user can renew it. */
	| { readonly kind: 'reauthorization_required'; readonly connectorTitle: string }
	/** The tool changed, disappeared or was turned off after the run was offered it. */
	| { readonly kind: 'withdrawn'; readonly reason: string };
