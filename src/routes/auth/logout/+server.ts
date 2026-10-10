import { redirect, type RequestHandler } from '@sveltejs/kit';
import { deleteSessionCookie, getSessionCookie } from '$lib/server/config';
import { AppFactory } from '$lib/server/factories/app-factory';

export const POST: RequestHandler = async ({ cookies }) => {
	const sessionId = getSessionCookie(cookies);

	if (sessionId) await AppFactory.access().endSession(sessionId);

	deleteSessionCookie(cookies);
	throw redirect(303, '/auth/login');
};
