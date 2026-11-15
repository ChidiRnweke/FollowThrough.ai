import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';
import * as schema from '$lib/server/db/schema/identity';
import { UnusedClientSweep } from '$lib/server/controllers/identity/client-retention';
import { ClientMetadataDocuments } from '$lib/server/repositories/identity/client-metadata-documents';
import {
	McpClientRecords,
	McpCredentialRecords,
	McpGrantRecords
} from '$lib/server/repositories/identity/postgres/mcp-authorization';
import { UserAccountRecords } from '$lib/server/repositories/identity/postgres/users';
import { McpClientDirectory } from '$lib/server/services/identity/mcp-clients';
import { McpCredentials, McpGrants } from '$lib/server/services/identity/mcp-grants';
import {
	connectMcpClient,
	reviewedMcpAuthorizationFor
} from '$lib/testing/identity/fixtures/mcp-connections';
import { context } from '../database-harness';

const day = 24 * 60 * 60 * 1000;

const setup = async () => {
	const user = await new UserAccountRecords(context.db).create({
		email: `mcp-retention-${crypto.randomUUID()}@example.test`,
		displayName: 'MCP retention contract',
		role: 'USER'
	});
	const clients = new McpClientDirectory({
		clients: new McpClientRecords(context.db),
		documents: new ClientMetadataDocuments()
	});
	const grants = new McpGrants(new McpGrantRecords({ userId: user.id }, context.db));
	const credentials = new McpCredentials(new McpCredentialRecords(context.db));
	const sweep = new UnusedClientSweep(clients, { retentionMs: day, intervalMs: 60_000 });
	const register = async (): Promise<string> => {
		const registered = await clients.register({
			name: 'Retention contract client',
			redirectUris: ['http://localhost/callback']
		});
		if ('error' in registered) throw new Error(registered.description);
		return registered.clientId;
	};
	return { grants, credentials, sweep, register };
};

/** Moves a registration's last use back, as if `ms` had passed since. */
const age = async (clientId: string, ms: number): Promise<void> => {
	await context.db
		.update(schema.mcpClients)
		.set({ lastUsedAt: new Date(Date.now() - ms) })
		.where(eq(schema.mcpClients.id, clientId));
};

const registered = async (clientId: string): Promise<boolean> =>
	(await new McpClientRecords(context.db).find(clientId)) !== null;

it('deletes a registration that no client used within the retention', async () => {
	const { sweep, register } = await setup();
	const clientId = await register();
	await age(clientId, 2 * day);
	await sweep.run();
	expect(await registered(clientId)).toBe(false);
});

it('keeps an unused registration that a live connection names', async () => {
	const { grants, credentials, sweep, register } = await setup();
	const clientId = await register();
	await connectMcpClient(grants, credentials, 'read', clientId);
	await age(clientId, 2 * day);
	await sweep.run();
	expect(await registered(clientId)).toBe(true);
});

it('keeps an unused registration that a pending code names', async () => {
	const { grants, sweep, register } = await setup();
	const clientId = await register();
	await grants.issueCode(reviewedMcpAuthorizationFor(clientId), 'read');
	await age(clientId, 2 * day);
	await sweep.run();
	expect(await registered(clientId)).toBe(true);
});

it('keeps a registration that received a code within the retention', async () => {
	const { grants, sweep, register } = await setup();
	const clientId = await register();
	await age(clientId, 2 * day);
	await grants.issueCode(reviewedMcpAuthorizationFor(clientId), 'read');
	// The code lapses unexchanged, so only the recorded use can keep the registration.
	await context.db
		.update(schema.mcpAuthorizationCodes)
		.set({ expiresAt: new Date(Date.now() - 1_000) })
		.where(eq(schema.mcpAuthorizationCodes.clientId, clientId));
	await sweep.run();
	expect(await registered(clientId)).toBe(true);
});

it('deletes an unused registration whose only connection was revoked', async () => {
	const { grants, credentials, sweep, register } = await setup();
	const clientId = await register();
	await connectMcpClient(grants, credentials, 'read', clientId);
	const [connection] = await grants.list();
	await grants.revoke(connection.id);
	await age(clientId, 2 * day);
	await sweep.run();
	expect(await registered(clientId)).toBe(false);
});

it('issues no code for a registration swept after its client was reviewed', async () => {
	const { grants, sweep, register } = await setup();
	const clientId = await register();
	await age(clientId, 2 * day);
	await sweep.run();
	const issued = await grants.issueCode(reviewedMcpAuthorizationFor(clientId), 'read').then(
		() => 'issued',
		(error: unknown) => (error instanceof Error ? error.message : 'not an error')
	);
	const codes = await context.db
		.select()
		.from(schema.mcpAuthorizationCodes)
		.where(eq(schema.mcpAuthorizationCodes.clientId, clientId));
	expect({ issued, codes: codes.length }).toEqual({
		issued: 'This MCP client registration has expired. Connect the client again to register it.',
		codes: 0
	});
});
