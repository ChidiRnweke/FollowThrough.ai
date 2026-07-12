import { AppFactory } from '$lib/server/app-factory';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const factory = AppFactory.controllerFactory();
	const output = await factory.trustPolicies().list(AppFactory.actor());
	return { policies: output.policies };
};
