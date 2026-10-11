import { command, query } from '$app/server';
import { z } from 'zod';
import type { DiagramId, DiagramRevisionId, DiagramEtag } from '$lib/models/diagrams';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';

const diagramIdSchema = z.uuid().transform((value) => value as DiagramId);
const revisionIdSchema = z.uuid().transform((value) => value as DiagramRevisionId);
export const listDiagramRevisions = command(diagramIdSchema, async (diagramId) =>
	AppFactory.forActor(requestActor()).diagramStudio().listDiagramRevisions({ diagramId })
);

export const getDiagramRevision = query(
	z.object({ diagramId: diagramIdSchema, revisionId: revisionIdSchema }),
	async (input) => AppFactory.forActor(requestActor()).diagramStudio().getDiagramRevision(input)
);

export const restoreDiagramRevision = command(
	z.object({
		diagramId: diagramIdSchema,
		revisionId: revisionIdSchema,
		baseEtag: z
			.string()
			.min(1)
			.transform((value) => value as DiagramEtag)
	}),
	async (input) => AppFactory.forActor(requestActor()).diagramStudio().restoreDiagramRevision(input)
);
