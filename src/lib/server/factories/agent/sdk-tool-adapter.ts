// chisel-ignore-file structural:factory-contains-logic -- This is the sole chat SDK tool construction adapter.
import type { Tool } from '@openai/agents';
import { z } from 'zod';
import { ValidationError } from '$lib/errors';
import { sdkTool } from '$lib/server/repositories/agent/sdk-tool';
import { readAgentPayload, type AgentPayload } from '$lib/models/agent/payload';
import {
	prepareToolCall,
	runToolAction,
	type PreparedAction,
	type ToolPreparation
} from './tool-call-boundary';

/** Direct invocation also accepts a blank argument string for fieldless tools.
 * The runner's earlier JSON protocol parser remains owned by the SDK.
 */
const withBlankInputTolerated = (built: Tool<unknown>): Tool<unknown> => {
	if (built.type !== 'function') return built;
	const invoke = built.invoke.bind(built);
	return {
		...built,
		invoke: (runContext, input, details) =>
			invoke(runContext, input.trim().length === 0 ? '{}' : input, details)
	};
};

// Strict model schemas represent omitted optional fields with null. Approval runs
// before the SDK removes those nulls. Normalize both stages from the original
// application schema; explicitly nullable fields retain their null value.
const allowsNull = (schema: z.core.JSONSchema.JSONSchema): boolean =>
	schema.type === 'null' ||
	(Array.isArray(schema.type) && schema.type.includes('null')) ||
	(schema.anyOf ?? schema.oneOf ?? []).some(allowsNull);

const normalizeInput = (
	value: AgentPayload,
	schema: z.core.JSONSchema.JSONSchema
): AgentPayload => {
	if (Array.isArray(value)) {
		const items = schema.items;
		return items && typeof items === 'object' && !Array.isArray(items)
			? value.map((item) => normalizeInput(item, items))
			: value;
	}
	if (value === null || typeof value !== 'object' || schema.type !== 'object') return value;
	return Object.fromEntries(
		Object.entries(value).flatMap(([key, entry]) => {
			const property = schema.properties?.[key];
			if (!property || typeof property === 'boolean') return [[key, entry]];
			if (entry === null && !schema.required?.includes(key) && !allowsNull(property)) return [];
			return [[key, normalizeInput(entry, property)]];
		})
	);
};

export interface SdkToolOptions {
	readonly name: string;
	readonly description: string;
	readonly parameters: z.ZodObject;
	readonly signal: AbortSignal;
	readonly isEnabled?: () => boolean;
	readonly prepare: (input: unknown, callId: string | undefined) => Promise<ToolPreparation>;
	readonly execute: (
		action: PreparedAction,
		callId: string | undefined,
		run: () => Promise<AgentPayload>
	) => Promise<AgentPayload>;
}

export const createSdkTool = (options: SdkToolOptions): Tool<unknown> => {
	const schema = z.toJSONSchema(options.parameters, { io: 'input' });
	const calls = new Map<string, { input: string; preparation: Promise<ToolPreparation> }>();
	// One preparation per call id: approval and execution share it, so the user
	// approves exactly what runs. Everything here is tool work, so any error is
	// feedback, including a provider reusing a call id for different arguments.
	const prepare = (input: unknown, callId: string | undefined) =>
		prepareToolCall(async () => {
			const payload = readAgentPayload(input);
			if (payload.kind === 'corrupt') throw new ValidationError(payload.message);
			const normalized = normalizeInput(payload.value, schema);
			const serialized = JSON.stringify(normalized);
			const prior = callId === undefined ? undefined : calls.get(callId);
			if (prior) {
				if (prior.input !== serialized)
					throw new ValidationError('A tool call identity was reused with different arguments');
				return prior.preparation;
			}
			const preparation = options.prepare(normalized, callId);
			if (callId !== undefined) calls.set(callId, { input: serialized, preparation });
			return preparation;
		}, options.signal);
	const built = sdkTool({
		name: options.name,
		description: options.description,
		parameters: options.parameters,
		signal: options.signal,
		...(options.isEnabled ? { isEnabled: options.isEnabled } : {}),
		needsApproval: async (input, callId) =>
			(await prepare(input, callId)).kind === 'approval_required',
		execute: async (input, callId) => {
			const prepared = await prepare(input, callId);
			if (prepared.kind === 'failure') return prepared;
			return options.execute(prepared.action, callId, () =>
				runToolAction(prepared.action, options.signal)
			);
		}
	});
	return Object.keys(options.parameters.shape).length === 0
		? withBlankInputTolerated(built)
		: built;
};
