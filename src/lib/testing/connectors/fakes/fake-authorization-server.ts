import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

const registrationSchema = z.object({ redirect_uris: z.array(z.string()) });

export interface FakeAuthorizationServerOptions {
	/** Advertises `client_id_metadata_document_supported`. */
	readonly metadataDocuments: boolean;
	/** Publishes a dynamic registration endpoint. */
	readonly registration: boolean;
	/** Advertises S256; an MCP client must refuse a server that does not. */
	readonly pkce: boolean;
	/** Sends `iss` on the authorization response (RFC 9207). */
	readonly issuerInResponse: boolean;
	/** Access token lifetime in seconds; tokens state no expiry when absent. */
	readonly accessTokenSeconds?: number;
	/** A client the operator registered in advance. */
	readonly preregistered?: { readonly clientId: string; readonly clientSecret: string };
	/** Registers dynamic clients as confidential, with a secret. */
	readonly confidentialRegistration?: boolean;
	/** Publishes this sign-in page instead of the issuer's own `/authorize`. */
	readonly authorizationEndpoint?: string;
	readonly now: () => Date;
}

interface IssuedCode {
	readonly clientId: string;
	readonly challenge: string;
	readonly redirectUri: string;
	readonly resource: string | null;
}

export interface Approval {
	readonly code: string;
	readonly state: string;
	readonly iss: string | undefined;
	/** The query the user agent returns to the redirect URI. */
	readonly query: Record<string, string>;
}

/**
 * An OAuth 2.1 authorization server for connector tests: metadata, dynamic
 * registration and the token endpoint over `fetch`, and `approve` standing in
 * for the user who signs in at the authorization endpoint.
 */
export class FakeAuthorizationServer {
	readonly registeredClients = new Map<string, string | undefined>();
	readonly tokenRequests: URLSearchParams[] = [];
	private readonly codes = new Map<string, IssuedCode>();
	private readonly accessTokens = new Map<string, number | undefined>();
	private readonly refreshTokens = new Set<string>();

	constructor(
		readonly issuer: string,
		private readonly options: FakeAuthorizationServerOptions
	) {}

	accepts(token: string): boolean {
		if (!this.accessTokens.has(token)) return false;
		const expiresAt = this.accessTokens.get(token);
		return expiresAt === undefined || expiresAt > this.options.now().getTime();
	}

	/** The user revokes FollowThrough's access at the service. */
	revokeAll(): void {
		this.accessTokens.clear();
		this.refreshTokens.clear();
	}

	/** Signs the user in at the authorization endpoint and redirects back. */
	approve(authorizationUrl: string): Approval {
		const url = new URL(authorizationUrl);
		const parameter = (name: string) => {
			const value = url.searchParams.get(name);
			if (value === null) throw new Error(`The authorization request has no ${name}`);
			return value;
		};
		if (url.origin !== new URL(this.issuer).origin) throw new Error('Approved at another server');
		if (parameter('response_type') !== 'code' || parameter('code_challenge_method') !== 'S256')
			throw new Error('The authorization request is not an S256 code request');
		const clientId = parameter('client_id');
		if (!this.knows(clientId)) throw new Error(`Unknown client ${clientId}`);
		const code = randomUUID();
		this.codes.set(code, {
			clientId,
			challenge: parameter('code_challenge'),
			redirectUri: parameter('redirect_uri'),
			resource: url.searchParams.get('resource')
		});
		const state = parameter('state');
		const iss = this.options.issuerInResponse ? this.issuer : undefined;
		return { code, state, iss, query: { code, state, ...(iss ? { iss } : {}) } };
	}

	readonly handle = async (request: Request): Promise<Response> => {
		const url = new URL(request.url);
		if (url.pathname === '/.well-known/oauth-authorization-server')
			return Response.json(this.metadata());
		if (url.pathname === '/register' && this.options.registration) return this.register(request);
		if (url.pathname === '/token' && request.method === 'POST') return this.token(request);
		return new Response('not found', { status: 404 });
	};

	private metadata() {
		return {
			issuer: this.issuer,
			authorization_endpoint: this.options.authorizationEndpoint ?? `${this.issuer}/authorize`,
			token_endpoint: `${this.issuer}/token`,
			response_types_supported: ['code'],
			grant_types_supported: ['authorization_code', 'refresh_token'],
			token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
			...(this.options.pkce ? { code_challenge_methods_supported: ['S256'] } : {}),
			...(this.options.registration ? { registration_endpoint: `${this.issuer}/register` } : {}),
			...(this.options.metadataDocuments ? { client_id_metadata_document_supported: true } : {}),
			...(this.options.issuerInResponse
				? { authorization_response_iss_parameter_supported: true }
				: {})
		};
	}

	private async register(request: Request): Promise<Response> {
		const body = registrationSchema.parse(await request.json());
		const clientId = `dynamic-${this.registeredClients.size + 1}`;
		const secret = this.options.confidentialRegistration ? `secret-${clientId}` : undefined;
		this.registeredClients.set(clientId, secret);
		return Response.json(
			{
				client_id: clientId,
				redirect_uris: body.redirect_uris,
				...(secret
					? { client_secret: secret, token_endpoint_auth_method: 'client_secret_basic' }
					: { token_endpoint_auth_method: 'none' })
			},
			{ status: 201 }
		);
	}

	private async token(request: Request): Promise<Response> {
		const form = new URLSearchParams(await request.text());
		this.tokenRequests.push(form);
		const basic = /^Basic (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
		const [basicId, basicSecret] = basic ? Buffer.from(basic, 'base64').toString().split(':') : [];
		const clientId = form.get('client_id') ?? (basicId ? decodeURIComponent(basicId) : undefined);
		const secret =
			form.get('client_secret') ?? (basicSecret ? decodeURIComponent(basicSecret) : undefined);
		if (!clientId || !this.knows(clientId) || this.expectedSecret(clientId) !== secret)
			return Response.json({ error: 'invalid_client' }, { status: 401 });
		if (form.get('grant_type') === 'authorization_code') {
			const issued = this.codes.get(form.get('code') ?? '');
			this.codes.delete(form.get('code') ?? '');
			const verifier = form.get('code_verifier') ?? '';
			if (
				!issued ||
				issued.clientId !== clientId ||
				issued.redirectUri !== form.get('redirect_uri') ||
				issued.resource !== form.get('resource') ||
				createHash('sha256').update(verifier).digest('base64url') !== issued.challenge
			)
				return Response.json({ error: 'invalid_grant' }, { status: 400 });
			return Response.json(this.issue());
		}
		if (form.get('grant_type') === 'refresh_token') {
			const refresh = form.get('refresh_token') ?? '';
			if (!this.refreshTokens.delete(refresh))
				return Response.json({ error: 'invalid_grant' }, { status: 400 });
			return Response.json(this.issue());
		}
		return Response.json({ error: 'unsupported_grant_type' }, { status: 400 });
	}

	/** Every issue rotates the refresh token. */
	private issue() {
		const accessToken = `access-${randomUUID()}`;
		const refreshToken = `refresh-${randomUUID()}`;
		const seconds = this.options.accessTokenSeconds;
		this.accessTokens.set(
			accessToken,
			seconds === undefined ? undefined : this.options.now().getTime() + seconds * 1000
		);
		this.refreshTokens.add(refreshToken);
		return {
			access_token: accessToken,
			token_type: 'Bearer',
			refresh_token: refreshToken,
			...(seconds === undefined ? {} : { expires_in: seconds })
		};
	}

	private knows(clientId: string): boolean {
		return (
			this.registeredClients.has(clientId) ||
			this.options.preregistered?.clientId === clientId ||
			(this.options.metadataDocuments && clientId.startsWith('https://'))
		);
	}

	private expectedSecret(clientId: string): string | undefined {
		if (this.options.preregistered?.clientId === clientId)
			return this.options.preregistered.clientSecret;
		return this.registeredClients.get(clientId);
	}
}
