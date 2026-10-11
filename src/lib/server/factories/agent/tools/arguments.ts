import { DomainError, ValidationError, failureReport } from '$lib/errors';
import type { PreparedAction } from '$lib/models/agent-tool-protocol';
import {
	agentPayloadObjectResultSchema,
	agentPayloadResultSchema,
	type AgentPayload,
	type AgentPayloadObject
} from '$lib/models/agent/payload';
import { toolFailure, type ToolFailure } from '$lib/models/agent/tool-failure';
import { trace } from '@opentelemetry/api';
import { z } from 'zod';

/** The model's arguments, parsed against the tool's schema and kept as the JSON it sent. */
export const parseToolArguments = <Shape extends z.ZodRawShape>(
	parameters: z.ZodObject<Shape>,
	input: unknown
): { readonly data: z.infer<z.ZodObject<Shape>>; readonly payload: AgentPayloadObject } => {
	const parsed = parameters.strict().safeParse(input);
	if (!parsed.success)
		throw new ValidationError(
			parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
		);
	const payload = agentPayloadObjectResultSchema.parse(parsed.data);
	if (payload.kind === 'corrupt') throw new Error(payload.message);
	return { data: parsed.data, payload: payload.value };
};

/** Validation is owned here, before either protocol can ask for approval. */
export const bindToolArguments = <Shape extends z.ZodRawShape>(
	parameters: z.ZodObject<Shape>,
	input: unknown,
	execute: (args: z.infer<z.ZodObject<Shape>>, payload: AgentPayloadObject) => Promise<AgentPayload>
): PreparedAction => {
	const { data, payload } = parseToolArguments(parameters, input);
	return { arguments: payload, execute: async () => execute(data, payload) };
};

/**
 * How a tool error becomes model feedback — decided here once, for every tool.
 *
 * A tool does its work and throws a meaningful error; it never catches one to report it.
 * {@link withToolFeedback} turns that error into the one failure envelope the model reads, and
 * the model corrects its next call within the same run. The SDK toolset and the MCP server
 * wrap every preparation and execution in it, so the policy cannot be skipped.
 *
 * Only cancellation escapes. There is no "the model cannot fix this" category inside a tool:
 * states a tool could not act on are excluded where their data enters (ADR 0037), and repeated
 * execution is answered by idempotent writes rather than by ending the run (ADRs 0003, 0010).
 */
export const withToolFeedback = async <Result>(
	signal: AbortSignal,
	work: () => Promise<Result>
): Promise<Result | ToolFailure> => {
	signal.throwIfAborted();
	try {
		return await work();
		// audit-allow: silent-catch — the failure is the tool's result: the model reads it as feedback and the chat records the call as failed.
	} catch (error) {
		signal.throwIfAborted();
		return feedback(error);
	}
};

const feedback = (error: unknown): ToolFailure => {
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
 * strict object schema Zod generates for the model-facing protocol, within the
 * subset strict function calling documents.
 */
export const jsonObjectSchema = (schema: z.ZodObject) => {
	const converted = z.toJSONSchema(schema, {
		io: 'input',
		// Zod writes a discriminated union as `oneOf`, which is outside the subset strict
		// function calling documents (it accepts `anyOf`) and is answered with an error. The
		// branches already exclude each other by their literal discriminator, so `anyOf`
		// accepts exactly the same values.
		override: ({ jsonSchema }) => {
			if (!jsonSchema.oneOf) return;
			jsonSchema.anyOf = jsonSchema.oneOf;
			delete jsonSchema.oneOf;
		}
	});
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

/** A tool's output, checked to be JSON the model and the event log can carry. */
export const toolOutput = (value: AgentPayload): AgentPayload => {
	const result = agentPayloadResultSchema.parse(value);
	if (result.kind === 'corrupt') throw new Error(result.message);
	return result.value;
};
