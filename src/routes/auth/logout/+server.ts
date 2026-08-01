import { redirect, type RequestHandler } from '@sveltejs/kit';
import { deleteSessionCookie, getSessionCookie } from '$lib/server/config';
import { AppFactory } from '$lib/server/app-factory';

export const POST: RequestHandler = async ({ cookies }) => {
	const sessionId = getSessionCookie(cookies);

	if (sessionId) {
		const authService = AppFactory.sessions();
		await authService.logout(sessionId);
	}

	deleteSessionCookie(cookies);
	throw redirect(303, '/auth/login');
};
