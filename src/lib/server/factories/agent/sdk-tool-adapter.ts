// chisel-ignore-file structural:factory-contains-logic -- This is the sole chat SDK tool construction adapter.
import { tool, ModelBehaviorError, type Tool } from '@openai/agents';
import { z } from 'zod';
import { toolFailure } from '$lib/models/agent/tool-failure';
import { DOMAIN_ERROR_ADVICE } from '$lib/errors';
import { agentPayloadResultSchema, type AgentPayload } from '$lib/models/agent/payload';
import {
	jsonObjectSchema,
	executeToolAction,
	prepareToolCall,
	ToolLifecycleError,
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
	readonly prepare: (
		input: unknown,
		callId: string | undefined,
		phase: 'approval' | 'execute'
	) => Promise<ToolPreparation>;
	readonly execute: (
		action: PreparedAction,
		callId: string | undefined,
		run: () => Promise<AgentPayload>
	) => Promise<AgentPayload>;
}

export const createSdkTool = (options: SdkToolOptions): Tool<unknown> => {
	const schema = z.toJSONSchema(options.parameters, { io: 'input' });
	const calls = new Map<string, { input: string; preparation: Promise<ToolPreparation> }>();
	const prepare = (input: unknown, callId: string | undefined, phase: 'approval' | 'execute') => {
		options.signal.throwIfAborted();
		const payload = agentPayloadResultSchema.parse(input);
		if (payload.kind === 'corrupt') throw new ToolLifecycleError(payload.message);
		const normalized = normalizeInput(payload.value, schema);
		const serialized = JSON.stringify(normalized);
		const prior = callId === undefined ? undefined : calls.get(callId);
		if (prior) {
			if (prior.input !== serialized)
				throw new ToolLifecycleError('A tool call identity was reused with different arguments');
			return prior.preparation;
		}
		const preparation = prepareToolCall(
			() => options.prepare(normalized, callId, phase),
			options.signal
		);
		if (callId !== undefined) calls.set(callId, { input: serialized, preparation });
		return preparation;
	};
	const built = tool({
		name: options.name,
		description: options.description,
		parameters: jsonObjectSchema(options.parameters),
		strict: true,
		...(options.isEnabled ? { isEnabled: options.isEnabled } : {}),
		needsApproval: async (_context, input, callId) =>
			(await prepare(input, callId, 'approval')).kind === 'approval_required',
		errorFunction: (_context, error) => {
			options.signal.throwIfAborted();
			if (error instanceof ModelBehaviorError && error.name === 'InvalidToolInputError')
				return JSON.stringify(
					toolFailure('VALIDATION', error.message, DOMAIN_ERROR_ADVICE.VALIDATION)
				);
			// Tool-local errors have already become values. Anything escaping is terminal.
			throw error;
		},
		execute: async (input, _context, details) => {
			const callId = details?.toolCall?.callId;
			const prepared = await prepare(input, callId, 'execute');
			if (prepared.kind === 'failure') return prepared.failure;
			return options.execute(prepared.action, callId, () =>
				executeToolAction(prepared.action, options.signal)
			);
		}
	});
	return Object.keys(options.parameters.shape).length === 0
		? withBlankInputTolerated(built)
		: built;
};
