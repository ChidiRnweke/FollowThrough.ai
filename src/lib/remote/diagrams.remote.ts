import { command } from '$app/server';
import { z } from 'zod';
import type { SaveDrawioDiagramInput } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import { requestActor } from '$lib/server/request-actor-factory';

export const saveDrawioDiagram = command(
	z.object({
		noteId: z.string().uuid(),
		diagramId: z.string().uuid(),
		source: z.string().trim().min(1).max(2_000_000),
		renderedSvg: z.string().trim().min(1).max(2_000_000)
	}),
	async (input) =>
		AppFactory.controllers()
			.diagrams()
			.saveDrawio(requestActor(), input as SaveDrawioDiagramInput)
);
