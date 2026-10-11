import { query } from '$app/server';
import { projectContextUsageInputSchema } from '$lib/models/context-usage';
import type { ProjectId } from '$lib/models/projects';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';

export const getProjectContextUsage = query(projectContextUsageInputSchema, ({ projectId }) =>
	AppFactory.forActor(requestActor())
		.contextUsage()
		.forProject(projectId as ProjectId)
);
