import { redirect, type RequestHandler } from '@sveltejs/kit';
import { sessionIdSchema } from '$lib/models/identity';
import { deleteSessionCookie, getSessionCookie } from '$lib/server/config';
import { AppFactory } from '$lib/server/factories/app-factory';

export const POST: RequestHandler = async ({ cookies }) => {
	// A malformed cookie names no session, so only the cookie is removed.
	const sessionId = sessionIdSchema.safeParse(getSessionCookie(cookies));

	if (sessionId.success) await AppFactory.authentication().endSession(sessionId.data);

	deleteSessionCookie(cookies);
	throw redirect(303, '/auth/login');
};
