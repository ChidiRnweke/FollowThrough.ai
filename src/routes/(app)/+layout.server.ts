import { AppFactory } from '$lib/server/app-factory';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies }) => {
	const factory = AppFactory.controllerFactory();
	const shell = await factory.workspace().getShellContext(AppFactory.actor());
	return { shell, sidebarOpen: cookies.get('sidebar_state') !== 'false' };
};
