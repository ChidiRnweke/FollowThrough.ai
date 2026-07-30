import type { ProjectId } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const projectId = params.id as ProjectId;
	const factory = AppFactory.controllers();
	const actor = AppFactory.actor(locals);
	const [projectView, attachments] = await Promise.all([
		factory.projects().get(actor, { projectId }),
		factory.attachments().listForProject(actor, projectId)
	]);
	return { project: projectView.project, attachments };
};
