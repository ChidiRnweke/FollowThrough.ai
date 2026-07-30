import { AppFactory } from '$lib/server/app-factory';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const factory = AppFactory.controllers();
	const output = await factory.skills().list(AppFactory.actor(locals));
	return { skills: output.skills };
};
