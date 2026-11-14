import { describe, expect, it } from 'vitest';
import type { User } from '$lib/models/identity';
import type { AuthorizationRequest } from '$lib/models/mcp-authorization';
import { McpClientDirectory } from '$lib/server/services/identity/mcp-clients';
import { McpCredentials, McpGrants } from '$lib/server/services/identity/mcp-grants';
import { NoteProvenance } from '$lib/server/services/notes/provenance';
import {
	InMemoryMcpAuthorizationRepository,
	StaticClientMetadataDocuments
} from '$lib/testing/identity/fakes/in-memory-mcp-authorization';
import {
	connectMcpClient,
	TEST_MCP_CLIENT,
	TEST_MCP_RESOURCE
} from '$lib/testing/identity/fixtures/mcp-connections';
import { InMemoryAnchorRepository } from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { testActor, testClock, testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { Access, type AccessDependencies } from './access';
import { Authentication, type AuthenticationDependencies } from './authentication';

const reader: User = {
	id: testActor().userId,
	email: 'reader@example.test',
	displayName: 'Reader',
	role: 'USER',
	createdAt: testNow,
	updatedAt: testNow
};

const request: AuthorizationRequest = {
	target: {
		clientId: TEST_MCP_CLIENT,
		redirectUri: 'http://localhost:53122/callback',
		state: 'opaque-state'
	},
	codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
	resource: TEST_MCP_RESOURCE,
	requestedScopes: []
};

const setup = () => {
	const provenance = new InMemoryProvenanceRepository(testActor());
	const repository = new InMemoryMcpAuthorizationRepository(testActor(), [reader]);
	const grants = new McpGrants(repository);
	const credentials = new McpCredentials(repository);
	const clients = new McpClientDirectory({
		clients: repository,
		documents: new StaticClientMetadataDocuments(
			new Map([
				[
					TEST_MCP_CLIENT,
					{
						kind: 'document',
						document: {
							client_id: TEST_MCP_CLIENT,
							client_name: 'Claude Code',
							redirect_uris: ['http://localhost/callback']
						}
					}
				]
			])
		)
	});
	const authentication = new Authentication(
		capabilityDependencies<AuthenticationDependencies>({ tokens: credentials })
	);
	const access = new Access(
		testActor(),
		capabilityDependencies<AccessDependencies>({
			clients,
			grants,
			provenance: new NoteProvenance(
				testActor(),
				provenance,
				new InMemoryAnchorRepository(testActor()),
				testClock
			)
		})
	);
	return { access, authentication, grants, credentials, provenance };
};

describe('approving an MCP client', () => {
	it('sends a code that the client can exchange for the chosen scope', async () => {
		const { access, credentials } = setup();
		const approved = await access.approveMcpClient(request, 'full', TEST_MCP_RESOURCE);
		if (approved.kind === 'failure') throw new Error(approved.description);
		const answer = new URL(approved.location);
		const issued = await credentials.exchange(
			{
				grant: 'authorization_code',
				code: answer.searchParams.get('code') ?? '',
				redirectUri: 'http://localhost:53122/callback',
				codeVerifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
				clientId: TEST_MCP_CLIENT,
				resource: TEST_MCP_RESOURCE
			},
			TEST_MCP_RESOURCE
		);
		expect({
			returnedTo: `${answer.origin}${answer.pathname}`,
			state: answer.searchParams.get('state'),
			issued
		}).toMatchObject({
			returnedTo: 'http://localhost:53122/callback',
			state: 'opaque-state',
			issued: { kind: 'issued', scope: 'full' }
		});
	});

	it('reviews the request again and sends nothing to a redirect URI the client never registered', async () => {
		const { access } = setup();
		const approved = await access.approveMcpClient(
			{ ...request, target: { ...request.target, redirectUri: 'https://attacker.example/cb' } },
			'full',
			TEST_MCP_RESOURCE
		);
		expect(approved).toMatchObject({ kind: 'failure', error: 'invalid_request' });
	});
});

describe('MCP access', () => {
	it('attributes a verified bearer request to the connection owner with its scope', async () => {
		const { access, authentication, grants, credentials, provenance } = setup();
		const issued = await connectMcpClient(grants, credentials, 'read');
		const verified = await authentication.verifyBearer(
			`Bearer ${issued.accessToken}`,
			TEST_MCP_RESOURCE
		);
		if (!verified) throw new Error('The issued credential did not verify');
		const result = await access.attributeMcp(verified.scope);
		expect({ result, recorded: provenance.provenance }).toMatchObject({
			result: { actor: { userId: reader.id }, scope: 'read' },
			recorded: [
				{
					id: result.provenanceId,
					userId: reader.id,
					producerName: 'MCP client',
					metadata: { scope: 'read' }
				}
			]
		});
	});

	it('rejects an unusable credential without recording provenance', async () => {
		const { authentication, provenance } = setup();
		const result = await authentication.verifyBearer('Bearer fta_unknown', TEST_MCP_RESOURCE);
		expect({ result, recorded: provenance.provenance }).toEqual({ result: null, recorded: [] });
	});
});
