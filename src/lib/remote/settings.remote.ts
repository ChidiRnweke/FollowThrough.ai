import { z } from 'zod';
import { command, form } from '$app/server';
import { AppFactory } from '$lib/server/app-factory';
import { requestActor } from './actor';
import type { UpdateTrustPolicyInput } from '$lib/models';

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
		minimumConfidence: z.number().min(0).max(1).optional()
	}),
	async (input) =>
		AppFactory.controllerFactory()
			.trustPolicies()
			.update(requestActor(), input as UpdateTrustPolicyInput)
);
