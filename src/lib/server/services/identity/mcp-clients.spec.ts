import { describe, expect, it } from 'vitest';
import type { AuthorizationRequest } from '$lib/models/mcp-authorization';
import type { ClientMetadataFetch } from '$lib/server/repositories/identity';
import {
	InMemoryMcpAuthorizationRepository,
	StaticClientMetadataDocuments
} from '$lib/testing/identity/fakes/in-memory-mcp-authorization';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { McpClientDirectory } from './mcp-clients';

const RESOURCE = 'https://ft.example/mcp';
const CLAUDE_CODE = 'https://claude.ai/oauth/claude-code-client-metadata';

const document = (
	clientId: string,
	redirectUris: readonly string[],
	name?: string
): ClientMetadataFetch => ({
	kind: 'document',
	document: {
		client_id: clientId,
		redirect_uris: [...redirectUris],
		...(name ? { client_name: name } : {})
	}
});

const setup = (documents: ReadonlyMap<string, ClientMetadataFetch> = new Map()) => {
	const clients = new InMemoryMcpAuthorizationRepository(testActor(), []);
	return {
		clients,
		directory: new McpClientDirectory({
			clients,
			documents: new StaticClientMetadataDocuments(documents)
		})
	};
};

const request = (
	clientId: string,
	redirectUri: string,
	resource = RESOURCE,
	requestedScopes: string[] = []
): AuthorizationRequest => ({
	target: { clientId, redirectUri, state: 'opaque-state' },
	codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
	resource,
	requestedScopes
});

describe('reviewing a client that identifies with a metadata document', () => {
	it('names the client from its document', async () => {
		const { directory } = setup(
			new Map([[CLAUDE_CODE, document(CLAUDE_CODE, ['http://localhost/callback'], 'Claude Code')]])
		);
		const reviewed = await directory.review(
			request(CLAUDE_CODE, 'http://localhost/callback'),
			RESOURCE
		);
		expect(reviewed).toMatchObject({
			kind: 'reviewed',
			client: { clientId: CLAUDE_CODE, name: 'Claude Code' }
		});
	});

	it('names an unnamed client after the host that vouches for it', async () => {
		const { directory } = setup(
			new Map([[CLAUDE_CODE, document(CLAUDE_CODE, ['http://localhost/callback'])]])
		);
		const reviewed = await directory.review(
			request(CLAUDE_CODE, 'http://localhost/callback'),
			RESOURCE
		);
		expect(reviewed).toMatchObject({ client: { name: 'claude.ai' } });
	});

	// RFC 8252 §7.3, and the portless loopback URIs Claude Code publishes.
	it.each([
		['http://localhost/callback', 'http://localhost:53122/callback'],
		['http://127.0.0.1/callback', 'http://localhost:3118/callback'],
		['http://localhost:*/callback', 'http://127.0.0.1:61000/callback'],
		['http://[::1]/callback', 'http://localhost:8080/callback']
	])('accepts loopback %s for a request to %s on any port', async (registered, requested) => {
		const { directory } = setup(new Map([[CLAUDE_CODE, document(CLAUDE_CODE, [registered])]]));
		const reviewed = await directory.review(request(CLAUDE_CODE, requested), RESOURCE);
		expect(reviewed.kind).toBe('reviewed');
	});

	it.each([
		['http://localhost/callback', 'http://localhost:53122/other'],
		['http://localhost/callback', 'https://attacker.example/callback'],
		['https://app.example/callback', 'https://app.example:8443/callback'],
		['https://app.example/callback', 'https://app.example/callback?next=x']
	])('refuses %s for a request to %s', async (registered, requested) => {
		const { directory } = setup(new Map([[CLAUDE_CODE, document(CLAUDE_CODE, [registered])]]));
		const reviewed = await directory.review(request(CLAUDE_CODE, requested), RESOURCE);
		expect(reviewed).toMatchObject({ kind: 'failure', error: 'invalid_request' });
	});

	it('refuses a client whose document cannot be used', async () => {
		const { directory } = setup(
			new Map([[CLAUDE_CODE, { kind: 'failure', reason: 'the metadata document is not JSON' }]])
		);
		const reviewed = await directory.review(
			request(CLAUDE_CODE, 'http://localhost/callback'),
			RESOURCE
		);
		expect(reviewed).toEqual({
			kind: 'failure',
			error: 'invalid_client',
			description: 'The client metadata could not be used: the metadata document is not JSON.'
		});
	});

	it('refuses a client_id that is not written the way its document must name it', async () => {
		const { directory } = setup(
			new Map([[CLAUDE_CODE, document(CLAUDE_CODE, ['http://localhost/callback'])]])
		);
		const reviewed = await directory.review(
			request('https://CLAUDE.ai/oauth/claude-code-client-metadata', 'http://localhost/callback'),
			RESOURCE
		);
		expect(reviewed).toMatchObject({ kind: 'failure', error: 'invalid_client' });
	});

	it.each([
		[[], 'read'],
		[['mcp:read'], 'read'],
		[['openid', 'mcp:full'], 'full'],
		[['full'], 'read']
	] satisfies [string[], 'read' | 'full'][])(
		'offers %j first as %s access',
		async (scopes, offered) => {
			const { directory } = setup(
				new Map([[CLAUDE_CODE, document(CLAUDE_CODE, ['http://localhost/callback'])]])
			);
			const reviewed = await directory.review(
				request(CLAUDE_CODE, 'http://localhost/callback', RESOURCE, scopes),
				RESOURCE
			);
			expect(reviewed).toMatchObject({ kind: 'reviewed', requestedScope: offered });
		}
	);

	it('refuses a request for another resource', async () => {
		const { directory } = setup(
			new Map([[CLAUDE_CODE, document(CLAUDE_CODE, ['http://localhost/callback'])]])
		);
		const reviewed = await directory.review(
			request(CLAUDE_CODE, 'http://localhost/callback', 'https://other.example/mcp'),
			RESOURCE
		);
		expect(reviewed).toMatchObject({ kind: 'failure', error: 'invalid_target' });
	});
});

describe('registering a client', () => {
	it('lets the registered client be reviewed with its own redirect URI', async () => {
		const { directory } = setup();
		const client = await directory.register({
			redirectUris: ['http://127.0.0.1:33418/callback'],
			name: 'MCP Inspector'
		});
		if ('kind' in client) throw new Error(client.description);
		const reviewed = await directory.review(
			request(client.clientId, 'http://127.0.0.1:33418/callback'),
			RESOURCE
		);
		expect(reviewed).toMatchObject({
			kind: 'reviewed',
			client: { clientId: client.clientId, name: 'MCP Inspector' }
		});
	});

	it('names an unnamed client after where its codes go', async () => {
		const { directory } = setup();
		const client = await directory.register({
			redirectUris: ['https://app.example/oauth/callback'],
			name: undefined
		});
		expect(client).toMatchObject({ name: 'app.example' });
	});

	it('accepts a private-use scheme for a native app', async () => {
		const { directory } = setup();
		const client = await directory.register({
			redirectUris: ['cursor://anysphere.cursor-mcp/oauth/callback'],
			name: 'Cursor'
		});
		expect(client).toMatchObject({
			redirectUris: ['cursor://anysphere.cursor-mcp/oauth/callback']
		});
	});

	it.each([
		'http://app.example/callback',
		'javascript:alert(1)',
		'data:text/html,hi',
		'https://app.example/callback#fragment'
	])('refuses to send codes to %s', async (redirectUri) => {
		const { directory, clients } = setup();
		const client = await directory.register({ redirectUris: [redirectUri], name: 'Client' });
		expect({
			client,
			stored: await clients.find('00000000-0000-4000-8000-000000000001')
		}).toMatchObject({
			client: { kind: 'failure', error: 'invalid_redirect_uri' },
			stored: null
		});
	});

	it('refuses an id it never issued', async () => {
		const { directory } = setup();
		const reviewed = await directory.review(
			request('00000000-0000-4000-8000-000000000099', 'http://127.0.0.1/callback'),
			RESOURCE
		);
		expect(reviewed).toMatchObject({ kind: 'failure', error: 'invalid_client' });
	});
});

describe('answering an authorization request', () => {
	it('sends the code and the client state to the requested redirect URI', async () => {
		const { directory } = setup(
			new Map([[CLAUDE_CODE, document(CLAUDE_CODE, ['http://localhost/callback'])]])
		);
		const reviewed = await directory.review(
			request(CLAUDE_CODE, 'http://localhost:53122/callback'),
			RESOURCE
		);
		if (reviewed.kind === 'failure') throw new Error(reviewed.description);
		expect(directory.answer(reviewed, { kind: 'code', code: 'ftc_code' })).toBe(
			'http://localhost:53122/callback?code=ftc_code&state=opaque-state'
		);
	});

	it('sends a refusal as an OAuth error', async () => {
		const { directory } = setup(
			new Map([[CLAUDE_CODE, document(CLAUDE_CODE, ['http://localhost/callback'])]])
		);
		const reviewed = await directory.review(
			request(CLAUDE_CODE, 'http://localhost/callback'),
			RESOURCE
		);
		if (reviewed.kind === 'failure') throw new Error(reviewed.description);
		const answered = new URL(
			directory.answer(reviewed, {
				kind: 'error',
				error: 'access_denied',
				description: 'The user refused access.'
			})
		);
		expect(Object.fromEntries(answered.searchParams)).toEqual({
			error: 'access_denied',
			error_description: 'The user refused access.',
			state: 'opaque-state'
		});
	});
});
