import { AppFactory } from '$lib/server/app-factory';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
	const factory = AppFactory.controllerFactory();
	const shell = await factory.workspace().getShellContext(AppFactory.actor());
	return { shell };
};
