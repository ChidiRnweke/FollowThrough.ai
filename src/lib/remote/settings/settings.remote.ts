import { z } from 'zod';
import { command, getRequestEvent, query } from '$app/server';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';
import {
	sessionIdSchema,
	sessionTokenSchema,
	type McpConnectionId,
	type SessionToken
} from '$lib/models/identity';
import { getSessionCookie } from '$lib/server/config';

export const listMcpConnections = query(async () =>
	AppFactory.forActor(requestActor()).mcpConnections().list()
);

export const revokeMcpConnection = command(z.string().uuid(), async (id) => {
	await AppFactory.forActor(requestActor())
		.mcpConnections()
		.revoke(id as McpConnectionId);
	await listMcpConnections().refresh();
});

/**
 * The asking browser's session token. The request hook admitted it before any remote function
 * runs, so a missing or malformed cookie here is a fault, not a signed-out browser.
 */
const currentSessionToken = (): SessionToken =>
	sessionTokenSchema.parse(getSessionCookie(getRequestEvent().cookies));

export const listSignedInBrowsers = query(async () =>
	AppFactory.forActor(requestActor()).signedInBrowsers().list(currentSessionToken())
);

export const signOutBrowser = command(sessionIdSchema, async (id) => {
	await AppFactory.forActor(requestActor()).signedInBrowsers().signOut(id);
	await listSignedInBrowsers().refresh();
});

export const signOutOtherBrowsers = command(async () => {
	const signedOut = await AppFactory.forActor(requestActor())
		.signedInBrowsers()
		.signOutOthers(currentSessionToken());
	await listSignedInBrowsers().refresh();
	return signedOut;
});
