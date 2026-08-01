import type { ProjectId } from '$lib/models/projects';
import { AppFactory } from '$lib/server/app-factory';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const projectId = params.id as ProjectId;
	const projectView = await AppFactory.controllers()
		.projects()
		.get(AppFactory.actor(locals), { projectId });
	return { project: projectView.project };
};
