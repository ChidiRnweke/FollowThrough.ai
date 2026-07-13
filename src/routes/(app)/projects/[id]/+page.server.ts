import type { ProjectId } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const factory = AppFactory.controllerFactory();
	const view = await factory
		.projects()
		.get(AppFactory.actor(), { projectId: params.id as ProjectId });
	return { view };
};
