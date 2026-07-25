import type { HandleServerError, ServerInit } from '@sveltejs/kit';
import { AppFactory } from '$lib/server/app-factory';
import { hydrateEnvironment } from '$lib/server/secrets';

import { redirect, type Handle } from '@sveltejs/kit';
import { getSessionCookie } from '$lib/services/auth/authService';
import { DomainError } from '$lib/models';
import { DOMAIN_ERROR_STATUS, describeError } from '$lib/server/http-errors';

// Prerendering during `vite build` and unit tests both run without a secrets
// backend, and must not pull configuration (which would, among other things,
// enable auth and redirect prerendered routes).
const configurationDisabled = (): boolean =>
	process.env.npm_lifecycle_event === 'build' || process.env.NODE_ENV === 'test';

export const init: ServerInit = async () => {
	if (configurationDisabled()) return;
	await hydrateEnvironment();
	const recovered = await AppFactory.recoverInterruptedRuns();
	if (recovered > 0)
		console.log(`[agent-run] Recovered ${recovered} interrupted run(s) on startup`);
};

// Domain failures are expected outcomes, not bugs: they carry a status and their
// own message, so the client can tell "name already taken" from "server broke".
// Kit reads `status` off the object returned here for both page renders and
// remote-function responses.
export const handleError: HandleServerError = ({ error, message }) => {
	if (error instanceof DomainError) {
		console.warn(`[domain] ${error.code} ${error.message}`);
		return { message: error.message, code: error.code, status: DOMAIN_ERROR_STATUS[error.code] };
	}
	console.error(`[unhandled] ${describeError(error)}`);
	return { message };
};

export const handle: Handle = async ({ event, resolve }) => {
	// Served from the secrets backend's TTL cache, so this is a no-op between refreshes.
	if (!configurationDisabled()) await hydrateEnvironment();

	const sessionId = getSessionCookie(event.cookies);

	// If auth is enabled, validate sessions
	if (AppFactory.isAuthEnabled()) {
		if (sessionId) {
			const authService = AppFactory.getAuthService();
			const result = await authService.validateSession(sessionId);
			if (result) {
				event.locals.user = result.user;
				event.locals.session = result.session;
			}
		}

		const user = event.locals.user;
		const path = event.url.pathname;

		// Allow auth routes without session
		if (path.startsWith('/auth/')) {
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
			throw redirect(303, '/');
		}

		// Role: ADMIN required for /_admin
		if (path.startsWith('/_admin') && user.role !== 'ADMIN') {
			throw redirect(303, '/');
		}
	} else {
		// Auth disabled — single-user mode (dev)
		// No session validation, actor() handles the local user
	}

	return resolve(event);
};
