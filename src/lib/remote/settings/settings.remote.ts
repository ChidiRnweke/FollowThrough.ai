import { z } from 'zod';
import { command, query } from '$app/server';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';
import type { McpConnectionId } from '$lib/models/identity';

export const listMcpConnections = query(async () =>
	AppFactory.forActor(requestActor()).mcpConnections().list()
);

export const revokeMcpConnection = command(z.string().uuid(), async (id) => {
	await AppFactory.forActor(requestActor())
		.mcpConnections()
		.revoke(id as McpConnectionId);
	await listMcpConnections().refresh();
});
