import type { HandleServerError, ServerInit } from '@sveltejs/kit';
import { building } from '$app/env';
import { AppFactory } from '$lib/server/factories/app-factory';
import type { OwnedRun } from '$lib/models/agent';
import { sessionTokenSchema } from '$lib/models/identity';
import {
	deleteSessionCookie,
	getSessionCookie,
	setSessionCookie,
	hydrateEnvironment,
	setWorkspaceAccountCookie,
	clearWorkspaceAccountCookie
} from '$lib/server/config';

import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { isForbiddenCrossSiteForm } from '$lib/server/infrastructure/http/request-origin';
import { logRefusal } from '$lib/server/infrastructure/http/refusal-log';
import { withResponseHeaders } from '$lib/server/infrastructure/http/response-headers';
import { DOMAIN_ERROR_STATUS, DomainError } from '$lib/errors';

export const init: ServerInit = async () => {
	// Builds and prerendering do not load deployment secrets.
	if (building) return;
	await hydrateEnvironment();
	// Recovery lists runs across every user, then acts on each as its owner. Interrupted runs
	// settle first, then queued agent runs and queued note-action workflows start.
	const recovery = AppFactory.system().runRecovery();
	const interrupted = await recovery.interrupted();
	for (const run of interrupted)
		await AppFactory.forActor(run.owner).agentHarness().recoverInterrupted(run.runId);
	const queuedAgents = await recovery.queuedAgentRuns();
	for (const run of queuedAgents)
		await AppFactory.forActor(run.owner).agentHarness().resumeQueued(run.runId);
	const workflows = [
		[
			'promise_extraction',
			(run: OwnedRun) => AppFactory.forActor(run.owner).todos().resumeQueuedPromiseRun(run.runId)
		],
		[
			'reference_search',
			(run: OwnedRun) =>
				AppFactory.forActor(run.owner).references().resumeQueuedReferenceRun(run.runId)
		],
		[
			'related_notes',
			(run: OwnedRun) =>
				AppFactory.forActor(run.owner).relationships().resumeQueuedRelatedNoteRun(run.runId)
		],
		[
			'diagram_action',
			(run: OwnedRun) => AppFactory.forActor(run.owner).diagrams().resumeQueuedDiagramRun(run.runId)
		]
	] as const;
	let queuedWorkflows = 0;
	for (const [kind, resume] of workflows) {
		const queued = await recovery.queuedWorkflowRuns(kind);
		queuedWorkflows += queued.length;
		for (const run of queued) await resume(run);
	}
	const recovered = interrupted.length + queuedAgents.length + queuedWorkflows;
	if (recovered > 0)
		console.log(`[agent-run] Recovered ${recovered} interrupted run(s) on startup`);
};

// Domain failures are expected outcomes, not bugs: they carry a status and their
// own message, so the client can tell "name already taken" from "server broke".
// Kit reads `status` off the object returned here for both page renders and
// remote-function responses.
export const handleError: HandleServerError = ({ error, message }) => {
	// The error object goes along as a second argument: the console bridge in
	// scripts/otel-instrumentation.js lifts its stack, cause chain, code and
	// details into log-record attributes. Interpolating alone would drop them.
	if (error instanceof DomainError) {
		console.warn(`[domain] ${error.code}`, error);
		return { message: error.message, code: error.code, status: DOMAIN_ERROR_STATUS[error.code] };
	}
	console.error('[unhandled]', error);
	return { message };
};

/**
 * Outermost, so the headers reach every response a route or the request policy below returns.
 * A redirect the policy throws is answered by Kit after this hook and carries none; it has no
 * body to sniff or frame, and the page it leads to carries its own.
 */
const responseHeaders: Handle = async ({ event, resolve }) =>
	withResponseHeaders(await resolve(event));

const requestPolicy: Handle = async ({ event, resolve }) => {
	// Prerendering and the generated browser shell have no request session.
	// The public offline page contains no account data at runtime either.
	if (building || event.url.pathname === '/offline') return resolve(event);

	// Kit's own check is off (see vite.config.ts); this is the same rule, minus the token endpoint.
	if (isForbiddenCrossSiteForm(event.request, event.url)) {
		logRefusal(event.url.pathname, 'cross-site form submission');
		return new Response(`Cross-site ${event.request.method} form submissions are forbidden`, {
			// chisel-ignore error-flow:raw-http-status -- this replaces SvelteKit's CSRF refusal, which answers 403 before any handler or error mapping runs.
			status: 403
		});
	}

	// Served from the secrets backend's TTL cache, so this is a no-op between refreshes.
	await hydrateEnvironment();

	// The MCP endpoint and the OAuth endpoints a client calls without a browser
	// authenticate on their own terms. They must never see the 303 to /auth/login
	// below, which an MCP client cannot interpret — each route answers itself.
	if (
		event.url.pathname.startsWith('/mcp') ||
		event.url.pathname.startsWith('/.well-known/oauth-') ||
		event.url.pathname === '/oauth/token' ||
		event.url.pathname === '/oauth/register'
	)
		return resolve(event);

	const sessionCookie = getSessionCookie(event.cookies);

	if (sessionCookie !== null) {
		const token = sessionTokenSchema.safeParse(sessionCookie);
		// A value no session token can have opens no session: drop the cookie without a lookup.
		if (!token.success) deleteSessionCookie(event.cookies);
		else {
			const result = await AppFactory.authentication().resumeSession(token.data);
			if (result) {
				// Session validation may extend the stored deadline. Keep the browser in sync. The
				// cookie carries the token; the stored session id is only its digest.
				setSessionCookie(
					event.cookies,
					token.data,
					event.url.protocol === 'https:',
					result.session.expiresAt
				);
				event.locals.user = result.user;
			}
		}
	}

	const user = event.locals.user;
	if (user) setWorkspaceAccountCookie(event.cookies, user.id, event.url.protocol === 'https:');
	else clearWorkspaceAccountCookie(event.cookies);
	const path = event.url.pathname;

	// Public surface: the auth flow, the landing page at the root, and the OAuth
	// client metadata document that authorization servers fetch for connectors.
	if (path.startsWith('/auth/') || path === '/' || path === '/oauth/client-metadata.json') {
		return resolve(event);
	}

	// Redirect unauthenticated users to login. An MCP client's consent request
	// resumes after sign-in, because the client is waiting for its answer.
	if (!user) {
		if (path === '/oauth/authorize')
			throw redirect(
				303,
				`/auth/login?${new URLSearchParams({ returnTo: path + event.url.search })}`
			);
		throw redirect(303, '/auth/login');
	}

	// Role: WAITING — lock to /waiting and /auth/logout
	if (user.role === 'WAITING') {
		const allowedPaths = ['/waiting', '/auth/logout'];
		if (!allowedPaths.some((p) => path.startsWith(p))) {
			throw redirect(303, '/waiting');
		}
	}

	// Redirect out of /waiting if approved
	if (user.role !== 'WAITING' && path === '/waiting') {
		throw redirect(303, '/today');
	}

	// Role: ADMIN required for /_admin
	if (path.startsWith('/_admin') && user.role !== 'ADMIN') {
		throw redirect(303, '/today');
	}

	return resolve(event);
};

export const handle = sequence(responseHeaders, requestPolicy);
