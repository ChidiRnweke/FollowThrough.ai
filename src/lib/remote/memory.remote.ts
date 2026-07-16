import { z } from 'zod';
import { command, query } from '$app/server';
import { AppFactory } from '$lib/server/app-factory';
import type {
	ListMemoryInput,
	CreateMemoryEntryInput,
	UpdateMemoryEntryInput,
	DeleteMemoryEntryInput
} from '$lib/models';

export const getEntries = query(z.string().uuid(), async (projectId) => {
	const factory = AppFactory.controllerFactory();
	return factory.memory().list(AppFactory.actor(), { projectId } as ListMemoryInput);
});

export const createEntry = command(
	z.object({
		projectId: z.string().uuid(),
		content: z.string().min(1),
		shareWithAgents: z.boolean().optional()
	}),
	async (input) => {
		return AppFactory.controllerFactory()
			.memory()
			.create(AppFactory.actor(), input as CreateMemoryEntryInput);
	}
);

export const updateEntry = command(
	z.object({
		memoryEntryId: z.string().uuid(),
		content: z.string().optional(),
		shareWithAgents: z.boolean().optional()
	}),
	async (input) => {
		return AppFactory.controllerFactory()
			.memory()
			.update(AppFactory.actor(), input as UpdateMemoryEntryInput);
	}
);

export const deleteEntry = command(
	z.object({ memoryEntryId: z.string().uuid() }),
	async (input) => {
		await AppFactory.controllerFactory()
			.memory()
			.remove(AppFactory.actor(), input as DeleteMemoryEntryInput);
	}
);
