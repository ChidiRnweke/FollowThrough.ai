import { z } from 'zod';
import { command, query } from '$app/server';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';
import type { TodoId, TodoListFilter, UpdateTodoInput } from '$lib/models/todos';
import type { ProjectId } from '$lib/models/projects';
import type { NoteId } from '$lib/models/notes';
import type { LocalDate } from '$lib/models/workspace';

const todoId = z
	.string()
	.uuid()
	.transform((value) => value as TodoId);
const projectId = z
	.string()
	.uuid()
	.transform((value) => value as ProjectId);
const noteId = z
	.string()
	.uuid()
	.transform((value) => value as NoteId);
const localDate = z.iso.date().transform((value) => value as LocalDate);

/** The board's shareable URL filters; the title search stays client-only, so the PDF
    reflects the server-side filters rather than the search box. */
export const exportBoardPdf = query(
	z.object({
		projectId: projectId.optional(),
		responsibility: z.enum(['mine', 'waiting_on']).optional(),
		category: z.string().trim().max(100).optional()
	}),
	async (input) => {
		return AppFactory.controllers().todos().exportBoardPdf(requestActor(), input);
	}
);

export const getTodo = query(todoId, async (todoId) => {
	const view = await AppFactory.controllers().todos().get(requestActor(), { todoId });
	return view.todo;
});

export const updateTodo = command(
	z
		.object({
			todoId,
			status: z.enum(['backlog', 'open', 'in_progress', 'done', 'cancelled']).optional(),
			title: z.string().optional(),
			description: z.string().nullable().optional(),
			dueDate: localDate.nullable().optional(),
			responsibility: z.enum(['mine', 'waiting_on']).optional(),
			priority: z.enum(['low', 'medium', 'high']).nullable().optional(),
			category: z.string().trim().max(100).nullable().optional(),
			waitingOn: z.string().nullable().optional(),
			linkedNoteId: noteId.nullable().optional()
		})
		.refine((value) => Object.keys(value).some((key) => key !== 'todoId'), {
			message: 'A todo update requires at least one edit'
		}),
	async (input) => {
		return AppFactory.controllers().todos().update(requestActor(), input);
	}
);

export const updateTodoStatus = updateTodo;

export const deleteTodo = command(z.object({ todoId }), async (input) => {
	await AppFactory.controllers().todos().remove(requestActor(), input.todoId);
});

export const createTodo = command(
	z.object({
		title: z.string().min(1),
		projectId: projectId.optional(),
		status: z.enum(['backlog', 'open', 'in_progress', 'done', 'cancelled']).optional()
	}),
	async (input) => {
		const factory = AppFactory.controllers();
		const actor = requestActor();
		let projectId = input.projectId;
		if (!projectId) {
			const { projects } = await factory.projects().list(actor);
			const general = projects.find((p) => p.name === 'General');
			if (general) projectId = general.id;
			else projectId = (await factory.projects().create(actor, { name: 'General' })).project.id;
		}
		let result = await factory.todos().create(actor, {
			projectId,
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
