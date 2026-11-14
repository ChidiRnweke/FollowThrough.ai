import { describe, expect, it } from 'vitest';
import type { ReviewedAuthorization, TokenRequest } from '$lib/models/mcp-authorization';
import {
	InMemoryMcpAuthorizationRepository,
	testMcpUser
} from '$lib/testing/identity/fakes/in-memory-mcp-authorization';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { McpCredentials, McpGrants } from './mcp-grants';

const RESOURCE = 'https://ft.example/mcp';
const CLIENT = 'https://claude.ai/oauth/claude-code-client-metadata';
const REDIRECT = 'http://localhost:53122/callback';
// RFC 7636 Appendix B.
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

const reviewed: ReviewedAuthorization = {
	kind: 'reviewed',
	client: { clientId: CLIENT, name: 'Claude Code', redirectUris: ['http://localhost/callback'] },
	request: {
		target: { clientId: CLIENT, redirectUri: REDIRECT, state: undefined },
		codeChallenge: CHALLENGE,
		resource: RESOURCE,
		requestedScopes: []
	},
	requestedScope: 'read'
};

const setup = (role: 'USER' | 'WAITING' = 'USER') => {
	const repository = new InMemoryMcpAuthorizationRepository(testActor(), [
		testMcpUser(testActor().userId, { role }),
		testMcpUser(testActor(2).userId)
	]);
	return {
		repository,
		grants: new McpGrants(repository),
		otherGrants: new McpGrants(repository.boundTo(testActor(2))),
		credentials: new McpCredentials(repository)
	};
};

const codeRequest = (
	code: string,
	overrides: Partial<Extract<TokenRequest, { grant: 'authorization_code' }>> = {}
): TokenRequest => ({
	grant: 'authorization_code',
	code,
	redirectUri: REDIRECT,
	codeVerifier: VERIFIER,
	clientId: CLIENT,
	resource: RESOURCE,
	...overrides
});

const refreshRequest = (refreshToken: string): TokenRequest => ({
	grant: 'refresh_token',
	refreshToken,
	clientId: CLIENT,
	resource: RESOURCE
});

/** Approves the request as the user and exchanges the code, as a client would. */
const connect = async (context: ReturnType<typeof setup>, scope: 'read' | 'full' = 'full') => {
	const code = await context.grants.issueCode(reviewed, scope);
	const issued = await context.credentials.exchange(codeRequest(code), RESOURCE);
	if (issued.kind === 'failure') throw new Error(issued.description);
	return issued;
};

describe('exchanging an authorization code', () => {
	it('issues tokens that act as the approving user with the scope they chose', async () => {
		const context = setup();
		const issued = await connect(context, 'read');
		const verified = await context.credentials.verify(`Bearer ${issued.accessToken}`, RESOURCE);
		expect({ issued, verified }).toMatchObject({
			issued: { kind: 'issued', expiresIn: 3600, scope: 'read' },
			verified: { user: { id: testActor().userId }, scope: 'read' }
		});
	});

	it('lists the connection under the client that was approved', async () => {
		const context = setup();
		await connect(context);
		expect(await context.grants.list()).toMatchObject([
			{ clientId: CLIENT, clientName: 'Claude Code', scope: 'full' }
		]);
	});

	it('accepts a code only once', async () => {
		const context = setup();
		const code = await context.grants.issueCode(reviewed, 'full');
		await context.credentials.exchange(codeRequest(code), RESOURCE);
		expect(await context.credentials.exchange(codeRequest(code), RESOURCE)).toMatchObject({
			kind: 'failure',
			error: 'invalid_grant'
		});
	});

	it.each([
		['a code_verifier that does not match', { codeVerifier: 'x'.repeat(43) }],
		['another client', { clientId: 'https://other.example/client' }],
		['another redirect URI', { redirectUri: 'http://localhost:9999/callback' }]
	] as const)('refuses an exchange with %s, and burns the code', async (_case, overrides) => {
		const context = setup();
		const code = await context.grants.issueCode(reviewed, 'full');
		const refused = await context.credentials.exchange(codeRequest(code, overrides), RESOURCE);
		expect({
			refused,
			retried: await context.credentials.exchange(codeRequest(code), RESOURCE)
		}).toMatchObject({
			refused: { kind: 'failure', error: 'invalid_grant' },
			retried: { kind: 'failure', error: 'invalid_grant' }
		});
	});

	it('refuses an expired code', async () => {
		const context = setup();
		const code = await context.grants.issueCode(reviewed, 'full');
		context.repository.expireCodes(new Date(Date.now() - 1));
		expect(await context.credentials.exchange(codeRequest(code), RESOURCE)).toMatchObject({
			kind: 'failure',
			description: 'The code has expired.'
		});
	});

	it('refuses a token request for another resource', async () => {
		const context = setup();
		const code = await context.grants.issueCode(reviewed, 'full');
		const refused = await context.credentials.exchange(
			codeRequest(code, { resource: 'https://other.example/mcp' }),
			RESOURCE
		);
		expect(refused).toMatchObject({ kind: 'failure', error: 'invalid_target' });
	});
});

describe('verifying an access token', () => {
	it('refuses a token presented to another resource', async () => {
		const context = setup();
		const issued = await connect(context);
		expect(
			await context.credentials.verify(`Bearer ${issued.accessToken}`, 'https://other.example/mcp')
		).toBeNull();
	});

	it('refuses an expired token', async () => {
		const context = setup();
		const issued = await connect(context);
		context.repository.expireAccessTokens(new Date(Date.now() - 1));
		expect(await context.credentials.verify(`Bearer ${issued.accessToken}`, RESOURCE)).toBeNull();
	});

	it('refuses a token whose account is waiting for approval', async () => {
		const context = setup('WAITING');
		const issued = await connect(context);
		expect(await context.credentials.verify(`Bearer ${issued.accessToken}`, RESOURCE)).toBeNull();
	});

	it.each(['', 'Basic abc', 'Bearer', 'Bearer ftr_not-an-access-token'])(
		'refuses the header %j',
		async (header) => {
			const context = setup();
			await connect(context);
			expect(await context.credentials.verify(header, RESOURCE)).toBeNull();
		}
	);
});

describe('refreshing', () => {
	it('replaces both tokens, and the old access token stops working', async () => {
		const context = setup();
		const first = await connect(context);
		const second = await context.credentials.exchange(refreshRequest(first.refreshToken), RESOURCE);
		if (second.kind === 'failure') throw new Error(second.description);
		expect({
			old: await context.credentials.verify(`Bearer ${first.accessToken}`, RESOURCE),
			current: (await context.credentials.verify(`Bearer ${second.accessToken}`, RESOURCE))?.scope,
			rotated: second.refreshToken !== first.refreshToken
		}).toEqual({ old: null, current: 'full', rotated: true });
	});

	it('revokes the connection when a rotated-out refresh token comes back', async () => {
		const context = setup();
		const first = await connect(context);
		const second = await context.credentials.exchange(refreshRequest(first.refreshToken), RESOURCE);
		if (second.kind === 'failure') throw new Error(second.description);
		const replayed = await context.credentials.exchange(
			refreshRequest(first.refreshToken),
			RESOURCE
		);
		expect({
			replayed,
			access: await context.credentials.verify(`Bearer ${second.accessToken}`, RESOURCE),
			refresh: await context.credentials.exchange(refreshRequest(second.refreshToken), RESOURCE),
			listed: await context.grants.list()
		}).toMatchObject({
			replayed: { kind: 'failure', error: 'invalid_grant' },
			access: null,
			refresh: { kind: 'failure', error: 'invalid_grant' },
			listed: []
		});
	});

	it('refuses a refresh token presented by another client', async () => {
		const context = setup();
		const first = await connect(context);
		const refused = await context.credentials.exchange(
			{ ...refreshRequest(first.refreshToken), clientId: 'https://other.example/client' },
			RESOURCE
		);
		expect(refused).toMatchObject({ kind: 'failure', error: 'invalid_grant' });
	});
});

describe('revoking a connection', () => {
	it('stops its access and refresh tokens', async () => {
		const context = setup();
		const issued = await connect(context);
		const [connection] = await context.grants.list();
		const revoked = await context.grants.revoke(connection.id);
		expect({
			revoked,
			access: await context.credentials.verify(`Bearer ${issued.accessToken}`, RESOURCE),
			refresh: await context.credentials.exchange(refreshRequest(issued.refreshToken), RESOURCE)
		}).toMatchObject({
			revoked: { id: connection.id, clientName: 'Claude Code' },
			access: null,
			refresh: { kind: 'failure', error: 'invalid_grant' }
		});
	});

	it('does not revoke another user’s connection', async () => {
		const context = setup();
		const issued = await connect(context);
		const [connection] = await context.grants.list();
		const outcome = await context.otherGrants.revoke(connection.id).then(
			() => 'revoked',
			(error: Error) => error.message
		);
		expect({
			outcome,
			stillWorks: (await context.credentials.verify(`Bearer ${issued.accessToken}`, RESOURCE))?.user
				.id
		}).toEqual({ outcome: 'MCP connection not found', stillWorks: testActor().userId });
	});
});
