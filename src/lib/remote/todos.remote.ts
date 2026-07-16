import { z } from 'zod';
import { command } from '$app/server';
import { AppFactory } from '$lib/server/app-factory';
import type { UpdateTodoInput } from '$lib/models';

export const updateTodoStatus = command(
	z.object({
		todoId: z.string().uuid(),
		status: z.enum(['backlog', 'open', 'in_progress', 'done', 'cancelled'])
	}),
	async (input) => {
		return AppFactory.controllerFactory()
			.todos()
			.update(AppFactory.actor(), input as UpdateTodoInput);
	}
);

export const createTodo = command(
	z.object({
		title: z.string().min(1),
		projectId: z.string().uuid().optional(),
		status: z.enum(['backlog', 'open', 'in_progress', 'done', 'cancelled']).optional()
	}),
	async (input) => {
		const factory = AppFactory.controllerFactory();
		const actor = AppFactory.actor();
		let projectId = input.projectId;
		if (!projectId) {
			const { projects } = await factory.projects().list(actor);
			const general = projects.find((p) => p.name === 'General');
			if (general) projectId = general.id as never;
			else
				projectId = (await factory.projects().create(actor, { name: 'General' })).project
					.id as never;
		}
		let result = await factory.todos().create(actor, {
			projectId: projectId as never,
			title: input.title,
			responsibility: 'mine'
		});
		if (input.status && input.status !== result.todo.status) {
			result = await factory.todos().update(actor, {
				todoId: result.todo.id,
				status: input.status
			});
		}
		return result;
	}
);
