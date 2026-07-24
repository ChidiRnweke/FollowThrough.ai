import { redirect, type RequestHandler } from '@sveltejs/kit';
import { AppFactory } from '$lib/server/app-factory';
import { deleteSessionCookie, getSessionCookie } from '$lib/services/auth/authService';

export const POST: RequestHandler = async ({ cookies }) => {
	const sessionId = getSessionCookie(cookies);

	if (sessionId) {
		const authService = AppFactory.getAuthService();
		await authService.logout(sessionId);
	}

	deleteSessionCookie(cookies);
	throw redirect(303, '/auth/login');
};
