import { redirect, type RequestHandler } from '@sveltejs/kit';
import { sessionTokenSchema } from '$lib/models/identity';
import { deleteSessionCookie, getSessionCookie } from '$lib/server/config';
import { AppFactory } from '$lib/server/factories/app-factory';

export const POST: RequestHandler = async ({ cookies }) => {
	// A malformed cookie names no session, so only the cookie is removed.
	const token = sessionTokenSchema.safeParse(getSessionCookie(cookies));

	if (token.success) await AppFactory.authentication().endSession(token.data);

	deleteSessionCookie(cookies);
	throw redirect(303, '/auth/login');
};
