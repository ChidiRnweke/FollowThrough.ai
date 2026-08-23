import { command, query } from '$app/server';
import { z } from 'zod';
import type {
	DiagramId,
	KeepStudioDiagramInput,
	SaveDrawioDiagramInput
} from '$lib/models/diagrams';
import type { ProjectId } from '$lib/models/projects';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';

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

export const saveProjectDrawio = command(
	z.object({
		diagramId: z.string().uuid(),
		source: z.string().trim().min(1).max(2_000_000),
		renderedSvg: z.string().trim().min(1).max(2_000_000)
	}),
	async (input) =>
		AppFactory.controllers()
			.diagramStudio()
			.saveProjectDrawio(requestActor(), { ...input, diagramId: input.diagramId as DiagramId })
);

/** One project diagram of either kind, for the studio canvas. */
export const getProjectDiagram = query(z.string().uuid(), async (diagramId) =>
	AppFactory.controllers()
		.diagramStudio()
		.getProjectDiagram(requestActor(), { diagramId: diagramId as DiagramId })
);

/**
 * The draw.io diagrams a project has produced.
 *
 * draw.io only, and not a parameter: a note can render a draw.io diagram and
 * nothing else, so every caller of this wants the same filter. The gallery pages
 * and searches server-side in its own loader.
 */
export const listProjectDiagrams = query(z.string().uuid(), async (projectId) =>
	AppFactory.controllers()
		.diagramStudio()
		.listProjectDiagrams(requestActor(), { projectId: projectId as ProjectId, kind: 'drawio' })
);

/** Turn what the studio canvas is showing into a durable project diagram. */
export const keepStudioDiagram = command(
	z.object({
		projectId: z.string().uuid(),
		conversationId: z.string().uuid(),
		// draw.io XML: the canvas holds nothing else.
		source: z.string().trim().min(1).max(2_000_000),
		title: z.string().trim().min(1).max(200).optional(),
		// Required: the embed's export is the only preview a draw.io diagram can have.
		renderedSvg: z.string().trim().min(1).max(2_000_000)
	}),
	async (input) =>
		AppFactory.controllers()
			.diagramStudio()
			.keepStudioDiagram(requestActor(), input as KeepStudioDiagramInput)
);

export const renameProjectDiagram = command(
	z.object({ diagramId: z.string().uuid(), title: z.string().trim().min(1).max(200) }),
	async (input) =>
		AppFactory.controllers()
			.diagramStudio()
			.renameProjectDiagram(requestActor(), { ...input, diagramId: input.diagramId as DiagramId })
);

export const deleteProjectDiagram = command(
	z.object({ diagramId: z.string().uuid() }),
	async (input) =>
		AppFactory.controllers()
			.diagramStudio()
			.deleteProjectDiagram(requestActor(), { diagramId: input.diagramId as DiagramId })
);

/** How many notes render this diagram, so its delete confirmation can say so. */
export const countDiagramReferences = query(z.string().uuid(), async (diagramId) =>
	AppFactory.controllers()
		.diagramStudio()
		.countDiagramReferences(requestActor(), { diagramId: diagramId as DiagramId })
);
