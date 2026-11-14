import { describe, expect, it } from 'vitest';
import { ExternalServiceError, ValidationError } from '$lib/errors';
import type { PendingAuthorization } from '$lib/models/connectors';
import type { DateTime } from '$lib/models/workspace';
import {
	FakeAuthorizationServer,
	type FakeAuthorizationServerOptions
} from '$lib/testing/connectors/fakes/fake-authorization-server';
import { FakeConnectorNetwork } from '$lib/testing/connectors/fakes/fake-connector-network';
import { FakeConnectorServer } from '$lib/testing/connectors/fakes/fake-connector-server';
import { ConnectorAuthorization, type ClientCredentials } from './authorization';

const now = new Date('2026-11-14T10:00:00Z');
const clock = () => now.toISOString() as DateTime;

const setup = (
	options: Partial<FakeAuthorizationServerOptions> = {},
	origin = 'https://followthrough.example',
	preregistered = new Map<'github', ClientCredentials>()
) => {
	const authorizationServer = new FakeAuthorizationServer('https://auth.example.com', {
		metadataDocuments: true,
		registration: true,
		pkce: true,
		issuerInResponse: false,
		accessTokenSeconds: 3600,
		now: () => now,
		...options
	});
	const server = new FakeConnectorServer('https://mcp.example.com', {
		path: '/mcp',
		authorization: {
			kind: 'bearer',
			accepts: (token) => authorizationServer.accepts(token),
			authorizationServer: authorizationServer.issuer,
			scopes: ['issues:read']
		},
		tools: []
	});
	const network = new FakeConnectorNetwork()
		.route(server.origin, server.handle)
		.route(authorizationServer.issuer, authorizationServer.handle);
	const authorization = new ConnectorAuthorization({
		fetch: network.fetch,
		origin,
		preregistered,
		now: clock
	});
	return { authorizationServer, server, network, authorization };
};

const pendingFrom = (
	start: Awaited<ReturnType<ConnectorAuthorization['begin']>>,
	serverUrl: string
): PendingAuthorization => ({
	target: { kind: 'new', source: { kind: 'custom' }, title: 'Example' },
	serverUrl,
	grant: start.grant,
	codeVerifier: start.codeVerifier,
	redirectUri: start.redirectUri
});

describe('ConnectorAuthorization', () => {
	it('uses the client metadata document when the server supports it and the origin is public', async () => {
		const { authorization, server, network } = setup();
		const start = await authorization.begin({
			serverUrl: server.url,
			registration: { kind: 'discovered' },
			challenge: undefined
		});
		const url = new URL(start.authorizationUrl);
		expect({
			origin: url.origin,
			clientId: url.searchParams.get('client_id'),
			method: url.searchParams.get('code_challenge_method'),
			resource: url.searchParams.get('resource'),
			scope: url.searchParams.get('scope'),
			state: url.searchParams.get('state') === start.state,
			redirect: url.searchParams.get('redirect_uri'),
			registered: network.sent.some((request) => request.url.endsWith('/register'))
		}).toEqual({
			origin: 'https://auth.example.com',
			clientId: 'https://followthrough.example/oauth/client-metadata.json',
			method: 'S256',
			resource: 'https://mcp.example.com/mcp',
			scope: 'issues:read',
			state: true,
			redirect: 'https://followthrough.example/connectors/callback',
			registered: false
		});
	});

	it('registers a client dynamically when the origin is local, and signs in with it', async () => {
		const { authorization, authorizationServer, server } = setup({}, 'http://localhost:5173');
		const start = await authorization.begin({
			serverUrl: server.url,
			registration: { kind: 'discovered' },
			challenge: undefined
		});
		const approval = authorizationServer.approve(start.authorizationUrl);
		const tokens = await authorization.exchange(
			pendingFrom(start, server.url),
			approval.code,
			approval.iss
		);
		expect({
			client: start.grant.client,
			works: authorizationServer.accepts(tokens.accessToken),
			expiry: tokens.expiry,
			refresh: tokens.refresh.kind
		}).toEqual({
			client: { kind: 'dynamic_public', clientId: 'dynamic-1' },
			works: true,
			expiry: { kind: 'at', at: '2026-11-14T11:00:00.000Z' },
			refresh: 'available'
		});
	});

	it('authenticates a preregistered client with its configured secret', async () => {
		const credentials = { clientId: 'operator-app', clientSecret: 'operator-secret' };
		const { authorization, authorizationServer, server } = setup(
			{ metadataDocuments: false, registration: false, preregistered: credentials },
			'https://followthrough.example',
			new Map([['github', credentials]])
		);
		const start = await authorization.begin({
			serverUrl: server.url,
			registration: { kind: 'preregistered', catalogId: 'github' },
			challenge: undefined
		});
		const approval = authorizationServer.approve(start.authorizationUrl);
		const tokens = await authorization.exchange(
			pendingFrom(start, server.url),
			approval.code,
			undefined
		);
		expect(authorizationServer.accepts(tokens.accessToken)).toBe(true);
	});

	it('refuses a server that offers neither registration, nor a missing preregistered client, nor no PKCE', async () => {
		const unregistrable = setup({ metadataDocuments: false, registration: false });
		const noPkce = setup({ pkce: false });
		const discovered = { kind: 'discovered' } as const;
		await expect(
			unregistrable.authorization.begin({
				serverUrl: unregistrable.server.url,
				registration: discovered,
				challenge: undefined
			})
		).rejects.toThrow('needs a client registered in advance');
		await expect(
			unregistrable.authorization.begin({
				serverUrl: unregistrable.server.url,
				registration: { kind: 'preregistered', catalogId: 'github' },
				challenge: undefined
			})
		).rejects.toBeInstanceOf(ValidationError);
		await expect(
			noPkce.authorization.begin({
				serverUrl: noPkce.server.url,
				registration: discovered,
				challenge: undefined
			})
		).rejects.toThrow('does not support PKCE');
	});

	it('refuses to send the browser to a sign-in page that is not on HTTPS', async () => {
		const plain = setup({ authorizationEndpoint: 'http://auth.example.com/authorize' });
		await expect(
			plain.authorization.begin({
				serverUrl: plain.server.url,
				registration: { kind: 'discovered' },
				challenge: undefined
			})
		).rejects.toThrow('not served over HTTPS');
	});

	it('rejects an answer from another issuer, and one without the issuer the server promised', async () => {
		const { authorization, authorizationServer, server } = setup({ issuerInResponse: true });
		const start = await authorization.begin({
			serverUrl: server.url,
			registration: { kind: 'discovered' },
			challenge: undefined
		});
		const approval = authorizationServer.approve(start.authorizationUrl);
		const pending = pendingFrom(start, server.url);
		await expect(
			authorization.exchange(pending, approval.code, 'https://attacker.example.net')
		).rejects.toBeInstanceOf(ValidationError);
		await expect(authorization.exchange(pending, approval.code, undefined)).rejects.toBeInstanceOf(
			ValidationError
		);
	});

	it('renews with the rotated refresh token, and reports a revoked one as rejected', async () => {
		const { authorization, authorizationServer, server } = setup();
		const start = await authorization.begin({
			serverUrl: server.url,
			registration: { kind: 'discovered' },
			challenge: undefined
		});
		const approval = authorizationServer.approve(start.authorizationUrl);
		const tokens = await authorization.exchange(
			pendingFrom(start, server.url),
			approval.code,
			undefined
		);
		if (tokens.refresh.kind !== 'available') throw new Error('Expected a refresh token');
		const renewal = await authorization.refresh(start.grant, tokens.refresh.refreshToken);
		authorizationServer.revokeAll();
		const afterRevocation =
			renewal.kind === 'renewed' && renewal.tokens.refresh.kind === 'available'
				? await authorization.refresh(start.grant, renewal.tokens.refresh.refreshToken)
				: renewal;
		expect({
			renewed: renewal.kind,
			rotated:
				renewal.kind === 'renewed' && renewal.tokens.refresh.kind === 'available'
					? renewal.tokens.refresh.refreshToken !== tokens.refresh.refreshToken
					: false,
			afterRevocation: afterRevocation.kind
		}).toEqual({ renewed: 'renewed', rotated: true, afterRevocation: 'rejected' });
	});

	it('reports an unreachable authorization server as an external failure', async () => {
		const { authorization } = setup();
		await expect(
			authorization.begin({
				serverUrl: 'https://unknown.example.com/mcp',
				registration: { kind: 'discovered' },
				challenge: undefined
			})
		).rejects.toBeInstanceOf(ExternalServiceError);
	});
});
