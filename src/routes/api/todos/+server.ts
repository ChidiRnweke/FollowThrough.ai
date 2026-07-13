import { json } from '@sveltejs/kit';
import {
	DEFAULT_PROJECT_NAME,
	type ProjectId,
	type TodoStatus,
	type UpdateTodoInput
} from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const input = (await request.json()) as UpdateTodoInput;
	const factory = AppFactory.controllerFactory();
	const output = await factory.todos().update(AppFactory.actor(), input);
	return json(output);
};

export const PUT: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as {
		title: string;
		projectId?: ProjectId;
		status?: TodoStatus;
	};
	const factory = AppFactory.controllerFactory();
	const actor = AppFactory.actor();
	let projectId = body.projectId;
	if (!projectId) {
		const { projects } = await factory.projects().list(actor);
		projectId = projects.find((project) => project.name === DEFAULT_PROJECT_NAME)?.id;
		projectId ??= (await factory.projects().create(actor, { name: DEFAULT_PROJECT_NAME })).project
			.id;
	}
	let result = await factory.todos().create(actor, {
		projectId,
		title: body.title,
		responsibility: 'mine'
	});
	if (body.status && body.status !== result.todo.status) {
		result = await factory.todos().update(actor, { todoId: result.todo.id, status: body.status });
	}
	return json(result);
};
