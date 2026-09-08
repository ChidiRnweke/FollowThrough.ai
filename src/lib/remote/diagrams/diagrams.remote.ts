import { command, query } from '$app/server';
import { z } from 'zod';
import type { DiagramId, DiagramRevisionId } from '$lib/models/diagrams';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';

const diagramIdSchema = z.uuid().transform((value) => value as DiagramId);
const revisionIdSchema = z.uuid().transform((value) => value as DiagramRevisionId);
export const listDiagramRevisions = command(diagramIdSchema, async (diagramId) =>
	AppFactory.controllers().diagramStudio().listDiagramRevisions(requestActor(), { diagramId })
);

export const getDiagramRevision = query(
	z.object({ diagramId: diagramIdSchema, revisionId: revisionIdSchema }),
	async (input) =>
		AppFactory.controllers().diagramStudio().getDiagramRevision(requestActor(), input)
);
