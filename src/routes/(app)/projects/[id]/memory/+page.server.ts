import type { ProjectId } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const projectId = params.id as ProjectId;
	const projectView = await AppFactory.controllerFactory()
		.projects()
		.get(AppFactory.actor(), { projectId });
	return { project: projectView.project };
};
