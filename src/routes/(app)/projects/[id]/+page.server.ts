import type { ProjectId } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const projectId = params.id as ProjectId;
	const factory = AppFactory.controllerFactory();
	const actor = AppFactory.actor();

	const [view, todosResult, memoryResult, artifactsResult, attachments] = await Promise.all([
		factory.projects().get(actor, { projectId }),
		factory.todos().list(actor, { projectId, status: 'open' }),
		factory.memory().list(actor, { projectId }),
		factory.deliverables().listArtifacts(actor, projectId),
		factory.attachments().listForProject(actor, projectId)
	]);

	return {
		view,
		counts: {
			todos: todosResult.todos.length,
			memory: memoryResult.entries.length,
			artifacts: artifactsResult.artifacts.length,
			attachments: attachments.length
		}
	};
};
