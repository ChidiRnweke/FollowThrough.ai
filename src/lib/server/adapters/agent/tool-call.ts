import { DomainError, ValidationError, failureReport } from '$lib/errors';
import type { PreparedAction, ToolCallReader } from '$lib/models/agent-tool-protocol';
import {
	agentPayloadObjectResultSchema,
	agentPayloadResultSchema,
	type AgentPayload,
	type AgentPayloadObject
} from '$lib/models/agent/payload';
import { toolFailure, type ToolFailure } from '$lib/models/agent/tool-failure';
import { trace } from '@opentelemetry/api';
import { z } from 'zod';

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
	const payload = agentPayloadObjectResultSchema.parse(parsed.data);
	if (payload.kind === 'corrupt') throw new Error(payload.message);
	return { arguments: payload.value, execute: async () => execute(parsed.data, payload.value) };
};

/** Only a tool-local stage may turn an exception into model feedback. */
const toolCallFailure = (error: unknown): ToolFailure => {
	if (!(error instanceof DomainError))
		trace.getActiveSpan()?.recordException(error instanceof Error ? error : String(error));
	const report = failureReport(error);
	return toolFailure(
		error instanceof DomainError ? error.code : 'INTERNAL_ERROR',
		report.message,
		report.advice
	);
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

export class ToolCallBoundary implements ToolCallReader {
	output(value: AgentPayload): AgentPayload {
		const result = agentPayloadResultSchema.parse(value);
		if (result.kind === 'corrupt') throw new Error(result.message);
		return result.value;
	}
	failure(error: unknown): ToolFailure {
		return toolCallFailure(error);
	}
}
