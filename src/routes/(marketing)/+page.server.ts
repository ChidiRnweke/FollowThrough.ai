import { redirect } from '@sveltejs/kit';
import { AppFactory } from '$lib/server/app-factory';
import type { PageServerLoad } from './$types';

// The root is the only public page. Anyone who is already through the door goes
// straight to their triage instead of reading the pitch again — including in
// single-user dev mode, where there is no session to check. `?landing` forces
// the page so it stays reachable while working on it.
export const load: PageServerLoad = async ({ locals, url }) => {
	if (url.searchParams.has('landing')) return {};

	const signedIn = AppFactory.isAuthEnabled()
		? locals.user !== undefined && locals.user.role !== 'WAITING'
		: true;

	if (signedIn) throw redirect(303, '/today');

	return {};
};
