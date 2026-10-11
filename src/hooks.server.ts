import type { HandleServerError, ServerInit } from '@sveltejs/kit';
import { building } from '$app/env';
import { AppFactory } from '$lib/server/factories/app-factory';
import type { OwnedRun } from '$lib/models/agent';
import {
	getSessionCookie,
	setSessionCookie,
	hydrateEnvironment,
	setWorkspaceAccountCookie,
	clearWorkspaceAccountCookie
} from '$lib/server/config';

import { redirect, type Handle } from '@sveltejs/kit';
import { DOMAIN_ERROR_STATUS, DomainError } from '$lib/errors';

// Prerendering during `vite build` and unit tests both run without a secrets
// backend, and must not pull configuration (which would, among other things,
// enable auth and redirect prerendered routes).
const configurationDisabled = (): boolean => building || process.env.NODE_ENV === 'test';

export const init: ServerInit = async () => {
	if (configurationDisabled()) return;
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

export const handle: Handle = async ({ event, resolve }) => {
	// Prerendering and the generated browser shell have no request session.
	// The public offline page contains no account data at runtime either.
	if (building || event.url.pathname === '/offline') return resolve(event);

	// Served from the secrets backend's TTL cache, so this is a no-op between refreshes.
	if (!configurationDisabled()) await hydrateEnvironment();

	// The MCP endpoint authenticates with a bearer token and speaks JSON-RPC.
	// It must never see the 303 to /auth/login below, which an MCP client
	// cannot interpret — the route answers 401 itself. Skipping the block
	// entirely also keeps its behaviour identical when auth is disabled in dev.
	if (event.url.pathname.startsWith('/mcp')) return resolve(event);

	const sessionId = getSessionCookie(event.cookies);

	// If auth is enabled, validate sessions
	if (AppFactory.isAuthEnabled()) {
		if (sessionId) {
			const result = await AppFactory.authentication().resumeSession(sessionId);
			if (result) {
				// Session validation may extend the stored deadline. Keep the browser in sync.
				setSessionCookie(
					event.cookies,
					result.session.id,
					event.url.protocol === 'https:',
					result.session.expiresAt
				);
				event.locals.user = result.user;
			}
		}

		const user = event.locals.user;
		if (user) setWorkspaceAccountCookie(event.cookies, user.id, event.url.protocol === 'https:');
		else clearWorkspaceAccountCookie(event.cookies);
		const path = event.url.pathname;

		// Public surface: the auth flow, and the landing page at the root.
		if (path.startsWith('/auth/') || path === '/') {
			return resolve(event);
		}

		// Redirect unauthenticated users to login
		if (!user) {
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
	} else {
		// Auth disabled — single-user mode (dev)
		// Establish the local profile before any workspace or tool write.
		setWorkspaceAccountCookie(
			event.cookies,
			(await AppFactory.localIdentity(AppFactory.actor()).initializeLocal()).id,
			event.url.protocol === 'https:'
		);
	}

	return resolve(event);
};
