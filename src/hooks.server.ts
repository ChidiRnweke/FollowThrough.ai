import type { ServerInit } from '@sveltejs/kit';
import { AppFactory } from '$lib/server/app-factory';

import { redirect, type Handle } from '@sveltejs/kit';
import { getSessionCookie } from '$lib/services/auth/authService';

export const init: ServerInit = async () => {
	if (process.env.npm_lifecycle_event === 'build' || process.env.NODE_ENV === 'test') return;
	const recovered = await AppFactory.recoverInterruptedRuns();
	if (recovered > 0)
		console.log(`[agent-run] Recovered ${recovered} interrupted run(s) on startup`);
};

export const handle: Handle = async ({ event, resolve }) => {
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
