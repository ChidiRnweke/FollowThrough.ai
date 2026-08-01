import type { ProjectId } from '$lib/models/projects';
import type { TodoListFilter, TodoResponsibility, TodoStatus } from '$lib/models/todos';
import { AppFactory } from '$lib/server/app-factory';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, locals }) => {
	const projectId = params.id as ProjectId;
	const status = url.searchParams.get('status') as TodoStatus | null;
	const responsibility = url.searchParams.get('responsibility') as TodoResponsibility | null;
	const category = url.searchParams.get('category');
	const filter: TodoListFilter = {
		projectId,
		...(status !== null ? { status } : {}),
		...(responsibility !== null ? { responsibility } : {}),
		...(category ? { category } : {})
	};
	const factory = AppFactory.controllers();
	const actor = AppFactory.actor(locals);
	const [output, projectView, categories] = await Promise.all([
		factory.todos().list(actor, filter),
		factory.projects().get(actor, { projectId }),
		factory.todos().listCategories(actor)
	]);
	return {
		todos: output.todos,
		categories,
		view: url.searchParams.get('view') ?? 'board',
		project: projectView.project
	};
};
