import { AppFactory } from '$lib/server/app-factory';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const output = await AppFactory.controllers()
		.notes()
		.listTrash(AppFactory.actor(locals), {});
	return { trashed: output.notes };
};
