import { z } from 'zod';
import { command, query } from '$app/server';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';
import type { ApiTokenId } from '$lib/models/identity';
import type { ProjectId } from '$lib/models/projects';
import type { UpdateTrustPolicyInput } from '$lib/models/agent';

/**
 * A command rather than a form: the control is a `<Select>` that mutates on change,
 * with no `<form>` to submit and nothing to progressively enhance.
 */
export const updateTrustPolicy = command(
	z.object({
		pipeline: z.enum(['extract_promises', 'relate', 'reference', 'agent', 'memory']),
		autoAcceptEnabled: z.boolean(),
		// Whole percent, matching the stored column and the confidence carried on suggestions.
		minimumConfidence: z.number().int().min(0).max(100).optional()
	}),
	async (input) =>
		AppFactory.controllers()
			.trustPolicies()
			.update(requestActor(), input as UpdateTrustPolicyInput)
);

export const listApiTokens = query(async () =>
	AppFactory.controllers().apiTokens().list(requestActor())
);

/**
 * Returns the plaintext credential — the only time it exists outside the
 * client's config. The caller must show it immediately; it is not recoverable.
 */
export const createApiToken = command(
	z.object({ name: z.string().min(1).max(80), scope: z.enum(['read', 'full']) }),
	async (input) => {
		const minted = await AppFactory.accessTokens().mint(requestActor().userId, input);
		await listApiTokens().refresh();
		return { token: minted.token, plaintext: minted.plaintext };
	}
);

export const revokeApiToken = command(z.string().uuid(), async (id) => {
	await AppFactory.controllers()
		.apiTokens()
		.revoke(requestActor(), id as ApiTokenId);
	await listApiTokens().refresh();
});

/**
 * Tool selection. `projectId` is the scope being edited: absent means the
 * workspace default, present means that project's overrides. Reads use the shared workspace records.
 */
const toolScope = z.object({ projectId: z.string().uuid().optional() });

export const setToolEnabled = command(
	toolScope.extend({ toolName: z.string().min(1), enabled: z.boolean() }),
	async (input) => {
		await AppFactory.controllers()
			.toolPreferences()
			.setEnabled(requestActor(), {
				toolName: input.toolName,
				enabled: input.enabled,
				...(input.projectId ? { projectId: input.projectId as ProjectId } : {})
			});
	}
);

export const resetToolOverride = command(
	z.object({ toolName: z.string().min(1), projectId: z.string().uuid() }),
	async (input) => {
		await AppFactory.controllers()
			.toolPreferences()
			.clearOverride(requestActor(), {
				toolName: input.toolName,
				projectId: input.projectId as ProjectId
			});
	}
);
