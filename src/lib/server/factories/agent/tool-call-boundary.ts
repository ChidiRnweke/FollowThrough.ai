// chisel-ignore-file structural:factory-contains-logic -- Protocol adapter owns validation and tool-local failures, not application composition.
import { trace } from '@opentelemetry/api';
import { z } from 'zod';
import { DomainError, ValidationError, failureReport } from '$lib/errors';
import { toolFailure, type ToolFailure } from '$lib/models/agent/tool-failure';
import {
	readAgentPayload,
	readAgentPayloadObject,
	type AgentPayload,
	type AgentPayloadObject
} from '$lib/models/agent/payload';

export interface PreparedAction {
	readonly arguments: AgentPayloadObject;
	readonly execute: () => Promise<AgentPayload>;
}

export type ToolPreparation =
	| { readonly kind: 'ready'; readonly action: PreparedAction }
	| { readonly kind: 'approval_required'; readonly action: PreparedAction }
	| { readonly kind: 'failure'; readonly failure: ToolFailure };

export class ToolLifecycleError extends Error {}

/** Validation is owned here, before either protocol can ask for approval. */
export const bindToolArguments = <Shape extends z.ZodRawShape>(
	parameters: z.ZodObject<Shape>,
	input: unknown,
	execute: (args: z.infer<z.ZodObject<Shape>>, payload: AgentPayloadObject) => Promise<AgentPayload>
): PreparedAction => {
	const parsed = parameters.strict().safeParse(input);
	if (!parsed.success)
		throw new ValidationError(
			parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
		);
	const payload = readAgentPayloadObject(parsed.data);
	if (payload.kind === 'corrupt') throw new Error(payload.message);
	return { arguments: payload.value, execute: () => execute(parsed.data, payload.value) };
};

/** Only a tool-local stage may turn an exception into model feedback. */
export const toolCallFailure = (error: unknown): ToolFailure => {
	if (!(error instanceof DomainError))
		trace.getActiveSpan()?.recordException(error instanceof Error ? error : String(error));
	const report = failureReport(error);
	return toolFailure(
		error instanceof DomainError ? error.code : 'INTERNAL_ERROR',
		report.message,
		report.advice
	);
};

export const prepareToolCall = async (
	prepare: () => Promise<ToolPreparation>,
	signal: AbortSignal
): Promise<ToolPreparation> => {
	signal.throwIfAborted();
	try {
		return await prepare();
	} catch (error) {
		signal.throwIfAborted();
		if (error instanceof ToolLifecycleError) throw error;
		return { kind: 'failure', failure: toolCallFailure(error) };
	}
};

export const executeToolAction = async (
	action: PreparedAction,
	signal: AbortSignal
): Promise<AgentPayload> => {
	signal.throwIfAborted();
	try {
		const output = await action.execute();
		const result = readAgentPayload(output);
		if (result.kind === 'corrupt') throw new Error(result.message);
		return result.value;
	} catch (error) {
		signal.throwIfAborted();
		if (error instanceof ToolLifecycleError) throw error;
		return toolCallFailure(error);
	}
};
/**
 * The Agents SDK uses a different Zod major, so it cannot consume this app's
 * Zod objects directly. Keep Zod as the execution validator and publish the
 * exact strict object schema Zod generates for the model-facing protocol.
 */
export const jsonObjectSchema = (schema: z.ZodObject) => {
	const converted = z.toJSONSchema(schema, { io: 'input' });
	if (
		converted.type !== 'object' ||
		converted.additionalProperties !== false ||
		typeof converted.properties !== 'object' ||
		converted.properties === null
	)
		throw new Error('Tool parameters must convert to a strict object schema');
	// audit-allow: no-record-unknown — JSON Schema property nodes are an open dialect by specification and are passed verbatim to the SDK protocol.
	const properties: Record<string, Record<string, unknown>> = {};
	for (const [name, property] of Object.entries(converted.properties)) {
		if (typeof property !== 'object' || property === null)
			throw new Error(`Tool parameter ${name} did not convert to an object schema`);
		properties[name] = property;
	}
	const required = Array.isArray(converted.required)
		? converted.required.filter((name): name is string => typeof name === 'string')
		: [];
	return {
		type: 'object' as const,
		properties,
		required,
		additionalProperties: false as const,
		...(converted.description ? { description: converted.description } : {})
	};
};
