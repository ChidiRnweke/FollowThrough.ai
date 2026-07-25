import { z } from 'zod';
import { command, query } from '$app/server';
import { AppFactory } from '$lib/server/app-factory';
import { requestActor } from './actor';
import type {
	ListMemoryInput,
	CreateMemoryEntryInput,
	UpdateMemoryEntryInput,
	DeleteMemoryEntryInput,
	ListPendingMemoryInput
} from '$lib/models';

export const getEntries = query(z.string().uuid().optional(), async (projectId) => {
	const factory = AppFactory.controllerFactory();
	return factory.memory().list(requestActor(), { projectId } as ListMemoryInput);
});

export const getPendingSuggestions = query(z.string().uuid().optional(), async (projectId) =>
	AppFactory.controllerFactory()
		.suggestions()
		.listPendingMemory(requestActor(), { projectId } as ListPendingMemoryInput)
);

export const createEntry = command(
	z.object({
		projectId: z.string().uuid().optional(),
		content: z.string().min(1),
		type: z.enum(['fact', 'decision', 'constraint', 'preference']).optional(),
		shareWithAgents: z.boolean().optional()
	}),
	async (input) => {
		return AppFactory.controllerFactory()
			.memory()
			.create(requestActor(), input as CreateMemoryEntryInput);
	}
);

export const updateEntry = command(
	z.object({
		memoryEntryId: z.string().uuid(),
		content: z.string().optional(),
		type: z.enum(['fact', 'decision', 'constraint', 'preference']).nullable().optional(),
		shareWithAgents: z.boolean().optional()
	}),
	async (input) => {
		return AppFactory.controllerFactory()
			.memory()
			.update(requestActor(), input as UpdateMemoryEntryInput);
	}
);

export const deleteEntry = command(
	z.object({ memoryEntryId: z.string().uuid() }),
	async (input) => {
		await AppFactory.controllerFactory()
			.memory()
			.remove(requestActor(), input as DeleteMemoryEntryInput);
	}
);
