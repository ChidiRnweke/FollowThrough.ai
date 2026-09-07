import { z } from 'zod';
import { resourceDataSchemas } from '$lib/models/workspace-records';

export const workspaceAccountCookieName = 'workspace_account';

/** Deployment data has no database journal; refresh this small bootstrap once per app start. */
export const workspaceBootstrapSchema = z.object({
	accountId: resourceDataSchemas.users.shape.id,
	agentDefaults: z.object({ chatModelId: z.string().min(1), visionModelId: z.string().min(1) }),
	agentModels: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			provider: z.string(),
			contextLength: z.number().optional(),
			supportsTools: z.boolean(),
			supportsVision: z.boolean(),
			recommended: z.boolean(),
			capabilities: z.array(z.string())
		})
	),
	numericDefaults: z.object({
		webSearchMaxResults: z.number().int().positive(),
		webSearchMaxTotalResults: z.number().int().positive(),
		agentMaxTurns: z.number().int().positive()
	}),
	agentAvailable: z.boolean()
});
export type WorkspaceBootstrap = z.infer<typeof workspaceBootstrapSchema>;
