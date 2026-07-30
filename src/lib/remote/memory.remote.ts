import { z } from 'zod';
import { command, query } from '$app/server';
import { AppFactory } from '$lib/server/app-factory';
import { requestActor } from '$lib/server/request-actor-factory';
import type {
	ListMemoryInput,
	CreateMemoryEntryInput,
	UpdateMemoryEntryInput,
	DeleteMemoryEntryInput,
	ListPendingMemoryInput
} from '$lib/models';

export const getEntries = query(z.string().uuid().optional(), async (projectId) => {
	const factory = AppFactory.controllers();
	return factory.memory().list(requestActor(), { projectId } as ListMemoryInput);
});

export const getPendingSuggestions = query(z.string().uuid().optional(), async (projectId) =>
	AppFactory.controllers()
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
		return AppFactory.controllers()
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
		return AppFactory.controllers()
			.memory()
			.update(requestActor(), input as UpdateMemoryEntryInput);
	}
);

export const deleteEntry = command(
	z.object({ memoryEntryId: z.string().uuid() }),
	async (input) => {
		await AppFactory.controllers()
			.memory()
			.remove(requestActor(), input as DeleteMemoryEntryInput);
	}
);
