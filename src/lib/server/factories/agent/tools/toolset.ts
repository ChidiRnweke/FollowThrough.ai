import { DOMAIN_ERROR_ADVICE, ToolLifecycleError } from '$lib/errors';
import type {
	AgentTool,
	AgentToolPolicy,
	AgentToolset,
	PreparedAction,
	ToolPreparation
} from '$lib/models/agent-tool-protocol';
import { agentPayloadResultSchema, type AgentPayload } from '$lib/models/agent/payload';
import { toolFailure } from '$lib/models/agent/tool-failure';
import { ModelBehaviorError, tool, type Tool } from '@openai/agents';
import { z } from 'zod';
import { bindToolArguments, jsonObjectSchema, toolCallFailure, toolOutput } from './arguments';
import { describeTools } from './catalog';

type Phase = 'approval' | 'execute';

const SEARCH_DESCRIPTION =
	'Find more FollowThrough tools relevant to what you want to do, when the tool you need is not already available directly. Each match comes back with its exact input schema and becomes a direct tool from your next message onward: call it by its own name with its arguments as flat top-level fields, exactly as the schema describes. There is no wrapper tool and no nested payload.';

export const searchToolsParameters = z
	.object({
		query: z.string().min(1),
		limit: z.number().int().min(1).max(15).optional()
	})
	.strict();

/**
 * Builds the SDK tools for one run from the harness's tool list and policy.
 *
 * First-class tools are registered directly. Every long-tail tool is registered with its real
 * flat schema but gated behind `isEnabled`: the SDK drops disabled function tools before it
 * serializes a request, so a gated tool costs no prompt tokens, and `isEnabled` is evaluated
 * before every generation, so a tool `search_tools` finds is callable on the very next one.
 * There is no `use_tool` envelope: its free-form payload renders as a property-less schema,
 * and several model families answered it with an empty object forever.
 */
export const createAgentToolset = (
	tools: readonly AgentTool[],
	policy: AgentToolPolicy
): AgentToolset => {
	const byName = new Map(tools.map((entry) => [entry.name, entry]));
	const reviews = new Map<string, string>();
	const preparations = new Map<string, { input: string; preparation: Promise<ToolPreparation> }>();
	for (const decision of policy.parked) {
		const entry = byName.get(decision.toolName);
		if (entry?.kind !== 'reviewed') continue;
		if (!decision.review)
			throw new ToolLifecycleError('A saved note approval is missing its prepared review');
		reviews.set(decision.callId, entry.review.restore(decision.review.content));
	}

	const prepareCall = async (
		entry: AgentTool,
		input: AgentPayload,
		callId: string | undefined,
		phase: Phase
	): Promise<ToolPreparation> => {
		const requirement = policy.plan.approvalRequired.includes(entry.name)
			? 'approval_required'
			: 'ready';
		if (entry.kind === 'direct') return { kind: requirement, action: entry.prepare(input) };
		if (!callId) throw new ToolLifecycleError('A note change requires a tool call identity');
		const saved = reviews.get(callId);
		// An approved call runs the change the user saw; without it there is nothing to apply.
		if (saved === undefined && phase === 'execute' && requirement === 'approval_required')
			throw new ToolLifecycleError('A resumed note approval is missing its prepared review');
		const prepared = await entry.review.prepare(input, saved);
		reviews.set(callId, prepared.review);
		if (prepared.kind === 'failure') return { kind: 'failure', failure: prepared.failure };
		return {
			kind: requirement,
			action: { arguments: prepared.arguments, execute: prepared.apply }
		};
	};

	/** One preparation per call identity, so approval and execution act on the same bound call. */
	const prepare = (
		bind: (input: AgentPayload) => Promise<ToolPreparation>,
		input: AgentPayload,
		callId: string | undefined
	): Promise<ToolPreparation> => {
		policy.signal.throwIfAborted();
		const serialized = JSON.stringify(input);
		const prior = callId === undefined ? undefined : preparations.get(callId);
		if (prior) {
			if (prior.input !== serialized)
				throw new ToolLifecycleError('A tool call identity was reused with different arguments');
			return prior.preparation;
		}
		const preparation = bind(input).catch((error: unknown): ToolPreparation => {
			policy.signal.throwIfAborted();
			if (error instanceof ToolLifecycleError) throw error;
			return { kind: 'failure', failure: toolCallFailure(error) };
		});
		if (callId !== undefined) preparations.set(callId, { input: serialized, preparation });
		return preparation;
	};

	const run = async (action: PreparedAction): Promise<AgentPayload> => {
		policy.signal.throwIfAborted();
		try {
			return toolOutput(await action.execute());
		} catch (error) {
			policy.signal.throwIfAborted();
			if (error instanceof ToolLifecycleError) throw error;
			return { ...toolCallFailure(error), kind: 'failure' };
		}
	};

	const build = (entry: AgentTool, gated: boolean): Tool<unknown> =>
		sdkTool({
			name: entry.name,
			description: entry.description,
			parameters: entry.parameters,
			signal: policy.signal,
			...(gated ? { isEnabled: () => policy.isDiscovered(entry.name) } : {}),
			prepare: (input, callId, phase) =>
				prepare((payload) => prepareCall(entry, payload, callId, phase), input, callId),
			execute: async (action, callId) => {
				const result = await run(action);
				await policy.completed(
					{
						...(callId === undefined ? {} : { callId }),
						toolName: entry.name,
						arguments: action.arguments,
						classification: entry.classification
					},
					result
				);
				return result;
			}
		});

	const permitted = [...policy.plan.initial, ...policy.plan.discoverable].flatMap((name) => {
		const entry = byName.get(name);
		return entry ? [entry] : [];
	});
	const searchTools = sdkTool({
		name: 'search_tools',
		description: SEARCH_DESCRIPTION,
		parameters: searchToolsParameters,
		signal: policy.signal,
		prepare: (input, callId) =>
			prepare(
				async (payload) => ({
					kind: 'ready',
					action: bindToolArguments(searchToolsParameters, payload, async ({ query, limit }) =>
						describeTools(permitted, await policy.discover(query, limit ?? 5))
					)
				}),
				input,
				callId
			),
		execute: (action) => run(action)
	});

	return {
		tools: [
			...policy.plan.initial.flatMap((name) => {
				const entry = byName.get(name);
				return entry ? [build(entry, false)] : [];
			}),
			...policy.plan.discoverable.flatMap((name) => {
				const entry = byName.get(name);
				return entry ? [build(entry, true)] : [];
			}),
			searchTools
		],
		checkpoint(pending) {
			const entry = byName.get(pending.toolName);
			if (entry?.kind !== 'reviewed') return pending;
			const content = reviews.get(pending.callId);
			if (content === undefined) throw new Error('A note approval has no prepared review');
			return { ...pending, review: { kind: entry.review.kind, content } };
		}
	};
};

interface SdkToolOptions {
	readonly name: string;
	readonly description: string;
	readonly parameters: z.ZodObject;
	readonly signal: AbortSignal;
	readonly isEnabled?: () => boolean;
	readonly prepare: (
		input: AgentPayload,
		callId: string | undefined,
		phase: Phase
	) => Promise<ToolPreparation>;
	readonly execute: (action: PreparedAction, callId: string | undefined) => Promise<AgentPayload>;
}

/** Direct invocation also accepts a blank argument string for fieldless tools. */
const withBlankInputTolerated = (built: Tool<unknown>): Tool<unknown> => {
	if (built.type !== 'function') return built;
	const invoke = built.invoke.bind(built);
	return {
		...built,
		invoke: (runContext, input, details) =>
			invoke(runContext, input.trim().length === 0 ? '{}' : input, details)
	};
};

// Strict model schemas represent omitted optional fields with null. Approval runs before the
// SDK removes those nulls, so both stages are normalized from the original application schema;
// explicitly nullable fields keep their null.
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

const sdkTool = (options: SdkToolOptions): Tool<unknown> => {
	const schema = z.toJSONSchema(options.parameters, { io: 'input' });
	const prepare = (input: unknown, callId: string | undefined, phase: Phase) => {
		options.signal.throwIfAborted();
		const payload = agentPayloadResultSchema.parse(input);
		if (payload.kind === 'corrupt') throw new ToolLifecycleError(payload.message);
		return options.prepare(normalizeInput(payload.value, schema), callId, phase);
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
			return options.execute(prepared.action, callId);
		}
	});
	return Object.keys(options.parameters.shape).length === 0
		? withBlankInputTolerated(built)
		: built;
};
