import type { ProjectId } from '$lib/models/projects';
import type { TodoListFilter, TodoResponsibility, TodoStatus } from '$lib/models/todos';
import { AppFactory } from '$lib/server/app-factory';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const status = url.searchParams.get('status') as TodoStatus | null;
	const responsibility = url.searchParams.get('responsibility') as TodoResponsibility | null;
	const projectId = url.searchParams.get('projectId') as ProjectId | null;
	const category = url.searchParams.get('category');
	const filter: TodoListFilter = {
		...(status !== null ? { status } : {}),
		...(responsibility !== null ? { responsibility } : {}),
		...(projectId !== null ? { projectId } : {}),
		...(category ? { category } : {})
	};
	const factory = AppFactory.controllers();
	const actor = AppFactory.actor(locals);
	const [output, categories] = await Promise.all([
		factory.todos().list(actor, filter),
		factory.todos().listCategories(actor)
	]);
	return { todos: output.todos, categories, view: url.searchParams.get('view') ?? 'board' };
};
