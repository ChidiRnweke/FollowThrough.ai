import { command, query } from '$app/server';
import {
	connectorIdSchema,
	connectRequestSchema,
	setConnectorToolPolicySchema
} from '$lib/models/connectors';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';

const connectors = () => AppFactory.forActor(requestActor()).connectors();

export const connectorCatalog = query(async () => connectors().catalog());

export const listConnectors = query(async () => connectors().list());

export const getConnector = query(connectorIdSchema, async (id) => connectors().get(id));

/**
 * Connects at once, or returns the authorization server to send the browser
 * to. The redirect comes back to `/connectors/callback`.
 */
export const connectConnector = command(connectRequestSchema, async (request) => {
	const start = await connectors().connect(request);
	await Promise.all([listConnectors().refresh(), connectorCatalog().refresh()]);
	return start;
});

export const reconnectConnector = command(connectorIdSchema, async (id) =>
	connectors().reconnect(id)
);

export const refreshConnectorTools = command(connectorIdSchema, async (id) => {
	const detail = await connectors().refreshTools(id);
	await Promise.all([getConnector(id).refresh(), listConnectors().refresh()]);
	return detail;
});

export const setConnectorToolPolicy = command(setConnectorToolPolicySchema, async (input) => {
	const tool = await connectors().setToolPolicy(input);
	await Promise.all([getConnector(input.connectorId).refresh(), listConnectors().refresh()]);
	return tool;
});

export const disconnectConnector = command(connectorIdSchema, async (id) => {
	await connectors().disconnect(id);
	await Promise.all([listConnectors().refresh(), connectorCatalog().refresh()]);
});
