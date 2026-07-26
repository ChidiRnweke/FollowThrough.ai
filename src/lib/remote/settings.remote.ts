import { z } from 'zod';
import { command, form, query } from '$app/server';
import { AppFactory } from '$lib/server/app-factory';
import { requestActor } from './actor';
import type { ApiTokenId, ProjectId, UpdateTrustPolicyInput } from '$lib/models';

/**
 * The settings switches are custom controls backed by hidden inputs, so their
 * booleans arrive as the strings they were rendered with rather than as
 * checkbox presence.
 */
const booleanText = z.enum(['true', 'false']).transform((value) => value === 'true');

export const saveAgentPreferences = form(
	z.object({
		defaultModel: z.string(),
		executionMode: z.enum(['approval_required', 'auto_accept']),
		inlineSuggestionsEnabled: booleanText
	}),
	async (input) => {
		await AppFactory.controllerFactory()
			.agentSettings()
			.updatePreferences(requestActor(), {
				defaultModel: input.defaultModel.trim() || null,
				executionMode: input.executionMode,
				inlineSuggestionsEnabled: input.inlineSuggestionsEnabled
			});
		return { saved: true };
	}
);

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
		AppFactory.controllerFactory()
			.trustPolicies()
			.update(requestActor(), input as UpdateTrustPolicyInput)
);

export const listApiTokens = query(async () =>
	AppFactory.controllerFactory().apiTokens().list(requestActor())
);

/**
 * Returns the plaintext credential — the only time it exists outside the
 * client's config. The caller must show it immediately; it is not recoverable.
 */
export const createApiToken = command(
	z.object({ name: z.string().min(1).max(80), scope: z.enum(['read', 'full']) }),
	async (input) => {
		const minted = await AppFactory.getApiTokenService().mint(requestActor().userId, input);
		await listApiTokens().refresh();
		return { token: minted.token, plaintext: minted.plaintext };
	}
);

export const revokeApiToken = command(z.string().uuid(), async (id) => {
	await AppFactory.controllerFactory()
		.apiTokens()
		.revoke(requestActor(), id as ApiTokenId);
	await listApiTokens().refresh();
});

/**
 * Tool selection. `projectId` is the scope being edited: absent means the
 * workspace default, present means that project's overrides — and it is part of
 * the query key, so switching scope reads a different list rather than
 * invalidating the one on screen.
 */
const toolScope = z.object({ projectId: z.string().uuid().optional() });

export const listToolPreferences = query(toolScope, async (input) =>
	AppFactory.controllerFactory()
		.toolPreferences()
		.list(requestActor(), input.projectId ? { projectId: input.projectId as ProjectId } : {})
);

export const setToolEnabled = command(
	toolScope.extend({ toolName: z.string().min(1), enabled: z.boolean() }),
	async (input) => {
		await AppFactory.controllerFactory()
			.toolPreferences()
			.setEnabled(requestActor(), {
				toolName: input.toolName,
				enabled: input.enabled,
				...(input.projectId ? { projectId: input.projectId as ProjectId } : {})
			});
		await listToolPreferences(input.projectId ? { projectId: input.projectId } : {}).refresh();
	}
);

export const resetToolOverride = command(
	z.object({ toolName: z.string().min(1), projectId: z.string().uuid() }),
	async (input) => {
		await AppFactory.controllerFactory()
			.toolPreferences()
			.clearOverride(requestActor(), {
				toolName: input.toolName,
				projectId: input.projectId as ProjectId
			});
		await listToolPreferences({ projectId: input.projectId }).refresh();
	}
);
