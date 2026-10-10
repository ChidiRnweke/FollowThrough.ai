import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Signed-in, approved users go straight to their workspace. `?landing` keeps
// the public page reachable while working on it.
export const load: PageServerLoad = async ({ locals, url }) => {
	if (url.searchParams.has('landing')) return {};

	const signedIn = locals.user !== undefined && locals.user.role !== 'WAITING';

	if (signedIn) throw redirect(303, '/today');

	return {};
};
