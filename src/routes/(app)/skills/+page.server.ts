import { AppFactory } from '$lib/server/app-factory';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const factory = AppFactory.controllerFactory();
	const output = await factory.skills().list(AppFactory.actor());
	return { skills: output.skills };
};
