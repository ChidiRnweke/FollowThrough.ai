import { command, query } from '$app/server';
import { z } from 'zod';
import type { DiagramId, DiagramEtag, DiagramRevisionId } from '$lib/models/diagrams';
import type { ProjectId } from '$lib/models/projects';
import type { ConversationId } from '$lib/models/agent';
import type { NoteId } from '$lib/models/notes';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';

const diagramIdSchema = z.uuid().transform((value) => value as DiagramId);
const revisionIdSchema = z.uuid().transform((value) => value as DiagramRevisionId);
const projectIdSchema = z.uuid().transform((value) => value as ProjectId);
const conversationIdSchema = z.uuid().transform((value) => value as ConversationId);
const noteIdSchema = z.uuid().transform((value) => value as NoteId);
const diagramEtagSchema = z
	.string()
	.min(1)
	.transform((value) => value as DiagramEtag);

export const saveDrawioDiagram = command(
	z.object({
		noteId: noteIdSchema,
		diagramId: diagramIdSchema,
		source: z.string().trim().min(1).max(2_000_000),
		renderedSvg: z.string().trim().min(1).max(2_000_000)
	}),
	async (input) => AppFactory.controllers().diagrams().saveDrawio(requestActor(), input)
);

export const saveProjectDrawio = command(
	z.object({
		diagramId: diagramIdSchema,
		source: z.string().trim().min(1).max(2_000_000),
		renderedSvg: z.string().trim().min(1).max(2_000_000)
	}),
	async (input) => AppFactory.controllers().diagramStudio().saveProjectDrawio(requestActor(), input)
);

/** One project diagram of either kind, for the studio canvas. */
export const getProjectDiagram = query(diagramIdSchema, async (diagramId) =>
	AppFactory.controllers().diagramStudio().getProjectDiagram(requestActor(), { diagramId })
);

export const findConversationDiagram = query(conversationIdSchema, async (conversationId) =>
	AppFactory.controllers()
		.diagramStudio()
		.findConversationDiagram(requestActor(), { conversationId })
);

/**
 * The draw.io diagrams a project has produced.
 *
 * draw.io only, and not a parameter: a note can render a draw.io diagram and
 * nothing else, so every caller of this wants the same filter. The gallery pages
 * and searches server-side in its own loader.
 */
export const listProjectDiagrams = query(projectIdSchema, async (projectId) =>
	AppFactory.controllers()
		.diagramStudio()
		.listProjectDiagrams(requestActor(), { projectId, kind: 'drawio' })
);

/** Turn what the studio canvas is showing into a durable project diagram. */
export const keepStudioDiagram = command(
	z.object({
		projectId: projectIdSchema,
		conversationId: conversationIdSchema,
		// draw.io XML: the canvas holds nothing else.
		source: z.string().trim().min(1).max(2_000_000),
		title: z.string().trim().min(1).max(200).optional(),
		// Required: the embed's export is the only preview a draw.io diagram can have.
		renderedSvg: z.string().trim().min(1).max(2_000_000)
	}),
	async (input) => AppFactory.controllers().diagramStudio().keepStudioDiagram(requestActor(), input)
);

export const renameProjectDiagram = command(
	z.object({
		diagramId: diagramIdSchema,
		title: z.string().trim().min(1).max(200),
		baseEtag: diagramEtagSchema
	}),
	async (input) =>
		AppFactory.controllers().diagramStudio().renameProjectDiagram(requestActor(), input)
);

export const saveProjectDiagramDraft = command(
	z.object({
		diagramId: diagramIdSchema,
		source: z.string().min(1).max(2_000_000),
		baseEtag: diagramEtagSchema
	}),
	async (input) =>
		AppFactory.controllers().diagramStudio().saveProjectDiagramDraft(requestActor(), input)
);

export const publishProjectDiagram = command(
	z.object({
		diagramId: diagramIdSchema,
		source: z.string().min(1).max(2_000_000),
		renderedSvg: z.string().min(1).max(3_000_000),
		baseEtag: diagramEtagSchema
	}),
	async (input) =>
		AppFactory.controllers().diagramStudio().publishProjectDiagram(requestActor(), input)
);

export const listDiagramRevisions = query(diagramIdSchema, async (diagramId) =>
	AppFactory.controllers().diagramStudio().listDiagramRevisions(requestActor(), { diagramId })
);

export const getDiagramRevision = query(
	z.object({ diagramId: diagramIdSchema, revisionId: revisionIdSchema }),
	async (input) =>
		AppFactory.controllers().diagramStudio().getDiagramRevision(requestActor(), input)
);

export const restoreDiagramRevision = command(
	z.object({
		diagramId: diagramIdSchema,
		revisionId: revisionIdSchema,
		baseEtag: diagramEtagSchema
	}),
	async (input) =>
		AppFactory.controllers().diagramStudio().restoreDiagramRevision(requestActor(), input)
);

/** Move a diagram to the trash. Reversible, unlike `deleteProjectDiagram` below. */
export const archiveProjectDiagram = command(
	z.object({ diagramId: diagramIdSchema }),
	async (input) =>
		AppFactory.controllers().diagramStudio().archiveProjectDiagram(requestActor(), input)
);

export const restoreProjectDiagram = command(
	z.object({ diagramId: diagramIdSchema }),
	async (input) =>
		AppFactory.controllers().diagramStudio().restoreProjectDiagram(requestActor(), input)
);

/** Every project when `projectId` is omitted, matching the global trash page. */
export const listTrashedDiagrams = query(
	z.object({ projectId: projectIdSchema.optional() }),
	async (input) =>
		AppFactory.controllers().diagramStudio().listTrashedProjectDiagrams(requestActor(), input)
);

export const deleteProjectDiagram = command(
	z.object({ diagramId: diagramIdSchema }),
	async (input) =>
		AppFactory.controllers().diagramStudio().deleteProjectDiagram(requestActor(), input)
);

/** How many notes render this diagram, so its delete confirmation can say so. */
export const countDiagramReferences = query(diagramIdSchema, async (diagramId) =>
	AppFactory.controllers().diagramStudio().countDiagramReferences(requestActor(), { diagramId })
);
