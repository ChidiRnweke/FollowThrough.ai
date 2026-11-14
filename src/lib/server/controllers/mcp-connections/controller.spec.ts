import { describe, expect, it } from 'vitest';
import { McpCredentials, McpGrants } from '$lib/server/services/identity/mcp-grants';
import {
	InMemoryMcpAuthorizationRepository,
	testMcpUser
} from '$lib/testing/identity/fakes/in-memory-mcp-authorization';
import {
	connectMcpClient,
	TEST_MCP_RESOURCE
} from '$lib/testing/identity/fixtures/mcp-connections';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { McpConnections } from './controller';

const setup = async () => {
	const repository = new InMemoryMcpAuthorizationRepository(testActor(), [
		testMcpUser(testActor().userId),
		testMcpUser(testActor(2).userId)
	]);
	const credentials = new McpCredentials(repository);
	const otherGrants = new McpGrants(repository.boundTo(testActor(2)));
	const issued = await connectMcpClient(new McpGrants(repository), credentials, 'read');
	return {
		issued,
		credentials,
		otherGrants,
		controller: new McpConnections({ connections: new McpGrants(repository) }),
		otherController: new McpConnections({ connections: otherGrants })
	};
};

describe('MCP connections controller', () => {
	it('lists only the connections the actor approved', async () => {
		const { otherGrants, credentials, controller } = await setup();
		await connectMcpClient(otherGrants, credentials, 'full');
		expect(await controller.list()).toMatchObject([
			{ userId: testActor().userId, clientName: 'Claude Code', scope: 'read' }
		]);
	});

	it('revokes the connection used for subsequent authentication', async () => {
		const { issued, credentials, controller } = await setup();
		const [connection] = await controller.list();
		const result = await controller.revoke(connection.id);
		expect({
			result,
			verified: await credentials.verify(`Bearer ${issued.accessToken}`, TEST_MCP_RESOURCE),
			listed: await controller.list()
		}).toEqual({
			result: { id: connection.id, clientName: 'Claude Code' },
			verified: null,
			listed: []
		});
	});

	it('does not revoke another actor’s connection', async () => {
		const { issued, credentials, controller, otherController } = await setup();
		const [connection] = await controller.list();
		const outcome = await otherController.revoke(connection.id).then(
			() => 'unexpected success',
			(error: Error) => error.message
		);
		expect({
			outcome,
			verified: (await credentials.verify(`Bearer ${issued.accessToken}`, TEST_MCP_RESOURCE))?.user
				.id
		}).toEqual({ outcome: 'MCP connection not found', verified: testActor().userId });
	});
});
