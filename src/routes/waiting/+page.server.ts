import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(303, '/auth/login');
	}

	if (locals.user.role !== 'WAITING') {
		throw redirect(303, '/today');
	}

	return { user: { email: locals.user.email, displayName: locals.user.displayName } };
};
