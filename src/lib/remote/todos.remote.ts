import { z } from 'zod';
import { command } from '$app/server';
import { AppFactory } from '$lib/server/app-factory';
import { requestActor } from './actor';
import type { UpdateTodoInput } from '$lib/models';

export const updateTodo = command(
	z
		.object({
			todoId: z.string().uuid(),
			status: z.enum(['backlog', 'open', 'in_progress', 'done', 'cancelled']).optional(),
			title: z.string().optional(),
			description: z.string().nullable().optional(),
			dueDate: z.string().nullable().optional(),
			responsibility: z.enum(['mine', 'waiting_on']).optional(),
			priority: z.enum(['low', 'medium', 'high']).nullable().optional(),
			waitingOn: z.string().nullable().optional(),
			linkedNoteId: z.string().uuid().nullable().optional()
		})
		.refine((value) => Object.keys(value).some((key) => key !== 'todoId'), {
			message: 'A todo update requires at least one edit'
		}),
	async (input) => {
		return AppFactory.controllerFactory()
			.todos()
			.update(requestActor(), input as UpdateTodoInput);
	}
);

export const updateTodoStatus = updateTodo;

export const deleteTodo = command(z.object({ todoId: z.string().uuid() }), async (input) => {
	await AppFactory.controllerFactory()
		.todos()
		.remove(requestActor(), input.todoId as never);
});

export const createTodo = command(
	z.object({
		title: z.string().min(1),
		projectId: z.string().uuid().optional(),
		status: z.enum(['backlog', 'open', 'in_progress', 'done', 'cancelled']).optional()
	}),
	async (input) => {
		const factory = AppFactory.controllerFactory();
		const actor = requestActor();
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
