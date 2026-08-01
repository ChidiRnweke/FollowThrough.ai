import { z } from 'zod';
import { command, form, query } from '$app/server';
import { AppFactory } from '$lib/server/app-factory';
import { requestActor } from '$lib/server/request-actor-factory';
import type { ApiTokenId, ProjectId, UpdateTrustPolicyInput, WebSearchEngine } from '$lib/models';

/**
 * The settings switches are custom controls backed by hidden inputs, so their
 * booleans arrive as the strings they were rendered with rather than as
 * checkbox presence.
 */
const booleanText = z.enum(['true', 'false']).transform((value) => value === 'true');

/**
 * Numeric settings arrive as strings for the same reason the booleans do, and an
 * empty field means "clear it" rather than zero. The ranges are the controller's
 * to enforce — repeating them here would only decide which error the user sees
 * first.
 */
const numberText = z
	.string()
	.transform((value) => (value.trim() === '' ? null : Number(value)))
	.refine((value) => value === null || Number.isFinite(value), 'Enter a number');

// The Models and Agents settings tabs save through separate forms, each sending
// only its own fields; the controller merges partial updates, so neither form has
// to know about the other's settings.
export const saveModelPreferences = form(
	z.object({
		defaultModel: z.string(),
		defaultVisionModel: z.string(),
		inlineModel: z.string(),
		attachmentVisionModel: z.string(),
		inlineSuggestionsEnabled: booleanText
	}),
	async (input) => {
		await AppFactory.controllers()
			.agentSettings()
			.updatePreferences(requestActor(), {
				defaultModel: input.defaultModel.trim() || null,
				defaultVisionModel: input.defaultVisionModel.trim() || null,
				inlineModel: input.inlineModel.trim() || null,
				attachmentVisionModel: input.attachmentVisionModel.trim() || null,
				inlineSuggestionsEnabled: input.inlineSuggestionsEnabled
			});
		return { saved: true };
	}
);

export const saveAgentPreferences = form(
	z.object({
		webSearchEngine: z.string(),
		webSearchMaxResults: numberText,
		webSearchMaxTotalResults: numberText,
		agentMaxTurns: numberText,
		executionMode: z.enum(['approval_required', 'auto_accept'])
	}),
	async (input) => {
		await AppFactory.controllers()
			.agentSettings()
			.updatePreferences(requestActor(), {
				webSearchEngine: (input.webSearchEngine.trim() || null) as WebSearchEngine | null,
				webSearchMaxResults: input.webSearchMaxResults,
				webSearchMaxTotalResults: input.webSearchMaxTotalResults,
				agentMaxTurns: input.agentMaxTurns,
				executionMode: input.executionMode
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
 * workspace default, present means that project's overrides — and it is part of
 * the query key, so switching scope reads a different list rather than
 * invalidating the one on screen.
 */
const toolScope = z.object({ projectId: z.string().uuid().optional() });

export const listToolPreferences = query(toolScope, async (input) =>
	AppFactory.controllers()
		.toolPreferences()
		.list(requestActor(), input.projectId ? { projectId: input.projectId as ProjectId } : {})
);

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
		await listToolPreferences(input.projectId ? { projectId: input.projectId } : {}).refresh();
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
		await listToolPreferences({ projectId: input.projectId }).refresh();
	}
);
