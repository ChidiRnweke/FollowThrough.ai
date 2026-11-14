import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';
import * as schema from '$lib/server/db/schema/identity';
import {
	McpClientRecords,
	McpCredentialRecords,
	McpGrantRecords
} from '$lib/server/repositories/identity/postgres/mcp-authorization';
import { UserAccountRecords } from '$lib/server/repositories/identity/postgres/users';
import { McpCredentials, McpGrants } from '$lib/server/services/identity/mcp-grants';
import {
	connectMcpClient,
	TEST_MCP_RESOURCE
} from '$lib/testing/identity/fixtures/mcp-connections';
import { context } from '../database-harness';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

const setup = async () => {
	const user = await new UserAccountRecords(context.db).create({
		email: `mcp-${crypto.randomUUID()}@example.test`,
		displayName: 'MCP contract',
		role: 'USER'
	});
	const actor = { userId: user.id };
	const grants = new McpGrants(new McpGrantRecords(actor, context.db));
	const credentials = new McpCredentials(new McpCredentialRecords(context.db));
	return { user, actor, grants, credentials };
};

it('stores only token hashes, never the tokens', async () => {
	const { grants, credentials } = await setup();
	const issued = await connectMcpClient(grants, credentials, 'read');
	const [connection] = await grants.list();
	const [stored] = await context.db
		.select()
		.from(schema.mcpConnections)
		.where(eq(schema.mcpConnections.id, connection.id));
	expect({
		access: stored.accessTokenHash,
		refresh: stored.refreshTokenHash,
		resource: stored.resource
	}).toEqual({
		access: sha256(issued.accessToken),
		refresh: sha256(issued.refreshToken),
		resource: TEST_MCP_RESOURCE
	});
});

it('exchanges a stored code once, and the code row is gone afterwards', async () => {
	const { grants, credentials, user } = await setup();
	await connectMcpClient(grants, credentials, 'full');
	const codes = await context.db
		.select()
		.from(schema.mcpAuthorizationCodes)
		.where(eq(schema.mcpAuthorizationCodes.userId, user.id));
	expect(codes).toEqual([]);
});

it('authenticates with the persisted scope and current account', async () => {
	const { grants, credentials, user } = await setup();
	const issued = await connectMcpClient(grants, credentials, 'full');
	expect(await credentials.verify(`Bearer ${issued.accessToken}`, TEST_MCP_RESOURCE)).toMatchObject(
		{
			user: { id: user.id },
			scope: 'full'
		}
	);
});

it('uses the current account role when validating an existing token', async () => {
	const { grants, credentials, actor } = await setup();
	const issued = await connectMcpClient(grants, credentials, 'full');
	await context.db
		.update(schema.users)
		.set({ role: 'WAITING' })
		.where(eq(schema.users.id, actor.userId));
	expect(await credentials.verify(`Bearer ${issued.accessToken}`, TEST_MCP_RESOURCE)).toBeNull();
});

it('rotates a refresh token once when two requests race with it', async () => {
	const { grants, credentials } = await setup();
	const issued = await connectMcpClient(grants, credentials, 'read');
	const request = {
		grant: 'refresh_token' as const,
		refreshToken: issued.refreshToken,
		clientId: 'https://claude.ai/oauth/claude-code-client-metadata',
		resource: TEST_MCP_RESOURCE
	};
	const outcomes = await Promise.all([
		credentials.exchange(request, TEST_MCP_RESOURCE),
		credentials.exchange(request, TEST_MCP_RESOURCE)
	]);
	expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual(['failure', 'issued']);
});

it('revokes the connection when a rotated-out refresh token is replayed', async () => {
	const { grants, credentials } = await setup();
	const issued = await connectMcpClient(grants, credentials, 'read');
	const request = {
		grant: 'refresh_token' as const,
		refreshToken: issued.refreshToken,
		clientId: 'https://claude.ai/oauth/claude-code-client-metadata',
		resource: TEST_MCP_RESOURCE
	};
	const rotated = await credentials.exchange(request, TEST_MCP_RESOURCE);
	if (rotated.kind === 'failure') throw new Error(rotated.description);
	await credentials.exchange(request, TEST_MCP_RESOURCE);
	expect({
		access: await credentials.verify(`Bearer ${rotated.accessToken}`, TEST_MCP_RESOURCE),
		listed: await grants.list()
	}).toEqual({ access: null, listed: [] });
});

it('keeps another actor’s connection private and valid after a refused revocation', async () => {
	const owner = await setup();
	const foreign = await setup();
	const issued = await connectMcpClient(owner.grants, owner.credentials, 'read');
	const [connection] = await owner.grants.list();
	const outcome = await foreign.grants.revoke(connection.id).then(
		() => 'unexpected success',
		(error: Error) => error.message
	);
	expect({
		outcome,
		listed: await foreign.grants.list(),
		verified: (await owner.credentials.verify(`Bearer ${issued.accessToken}`, TEST_MCP_RESOURCE))
			?.user.id
	}).toEqual({ outcome: 'MCP connection not found', listed: [], verified: owner.user.id });
});

it('finds a registered client by id and nothing for an id it never issued', async () => {
	const clients = new McpClientRecords(context.db);
	const created = await clients.create({
		name: 'Contract client',
		redirectUris: ['http://127.0.0.1/callback']
	});
	expect({
		found: await clients.find(created.clientId),
		metadataUrl: await clients.find('https://claude.ai/oauth/claude-code-client-metadata'),
		unknown: await clients.find(crypto.randomUUID())
	}).toEqual({ found: created, metadataUrl: null, unknown: null });
});
