import type { ProjectId, TodoListFilter, TodoResponsibility, TodoStatus } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, locals }) => {
	const projectId = params.id as ProjectId;
	const status = url.searchParams.get('status') as TodoStatus | null;
	const responsibility = url.searchParams.get('responsibility') as TodoResponsibility | null;
	const filter: TodoListFilter = {
		projectId,
		...(status !== null ? { status } : {}),
		...(responsibility !== null ? { responsibility } : {})
	};
	const factory = AppFactory.controllerFactory();
	const actor = AppFactory.actor(locals);
	const [output, projectView] = await Promise.all([
		factory.todos().list(actor, filter),
		factory.projects().get(actor, { projectId })
	]);
	return {
		todos: output.todos,
		view: url.searchParams.get('view') ?? 'board',
		project: projectView.project
	};
};
