import { z } from 'zod';
import { command } from '$app/server';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';
import type { MemoryEntryId } from '$lib/models/memory';
import type { ProjectId } from '$lib/models/projects';

const projectId = z.uuid().transform((value) => value as ProjectId);
const memoryEntryId = z.uuid().transform((value) => value as MemoryEntryId);

export const createEntry = command(
	z.object({
		projectId: projectId.optional(),
		content: z.string().min(1),
		type: z.enum(['fact', 'decision', 'constraint', 'preference']).optional(),
		shareWithAgents: z.boolean().optional()
	}),
	async (input) => {
		return AppFactory.controllers().memory().create(requestActor(), input);
	}
);

export const updateEntry = command(
	z.object({
		memoryEntryId,
		content: z.string().optional(),
		type: z.enum(['fact', 'decision', 'constraint', 'preference']).nullable().optional(),
		shareWithAgents: z.boolean().optional()
	}),
	async (input) => {
		return AppFactory.controllers().memory().update(requestActor(), input);
	}
);

export const deleteEntry = command(z.object({ memoryEntryId }), async (input) => {
	await AppFactory.controllers().memory().remove(requestActor(), input);
});
