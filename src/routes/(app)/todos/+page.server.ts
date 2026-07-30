import type { ProjectId, TodoListFilter, TodoResponsibility, TodoStatus } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const status = url.searchParams.get('status') as TodoStatus | null;
	const responsibility = url.searchParams.get('responsibility') as TodoResponsibility | null;
	const projectId = url.searchParams.get('projectId') as ProjectId | null;
	const filter: TodoListFilter = {
		...(status !== null ? { status } : {}),
		...(responsibility !== null ? { responsibility } : {}),
		...(projectId !== null ? { projectId } : {})
	};
	const factory = AppFactory.controllers();
	const output = await factory.todos().list(AppFactory.actor(locals), filter);
	return { todos: output.todos, view: url.searchParams.get('view') ?? 'board' };
};
