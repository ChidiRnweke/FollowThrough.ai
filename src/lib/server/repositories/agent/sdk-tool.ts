import { ModelBehaviorError, tool, type Tool } from '@openai/agents';
import { trace } from '@opentelemetry/api';
import { z } from 'zod';
import { DOMAIN_ERROR_ADVICE, DomainError, failureReport } from '$lib/errors';
import { toolFailure, type ToolFailure } from '$lib/models/agent/tool-failure';
import type { AgentPayload } from '$lib/models/agent/payload';

/**
 * How a tool error becomes model feedback — decided here once, for every tool.
 *
 * A tool does its work and throws a meaningful error; it never catches one to
 * report it. {@link withToolFeedback} turns that error into the one failure
 * envelope the model reads, and the model corrects its next call within the
 * same run. {@link sdkTool} applies it to every Agents SDK tool, and the
 * `tool-boundary` audit allows the SDK's `tool()` nowhere else, so the policy
 * cannot be skipped. The MCP adapter applies the same wrapper to its handlers.
 *
 * Only cancellation escapes. There is no "the model cannot fix this" category
 * inside a tool: states a tool could not act on are excluded where their data
 * enters (ADR 0037), and repeated execution is answered by idempotent writes
 * rather than by ending the run (ADRs 0003, 0010).
 */

/** A tool's own work, with any error it raises returned as model feedback. */
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

export interface SdkToolDefinition {
	readonly name: string;
	readonly description: string;
	readonly parameters: z.ZodObject;
	readonly signal: AbortSignal;
	readonly isEnabled?: () => boolean;
	readonly needsApproval?: (input: unknown, callId: string | undefined) => Promise<boolean>;
	/** The tool's work. Any error it throws reaches the model as feedback. */
	readonly execute: (input: unknown, callId: string | undefined) => Promise<AgentPayload>;
}

/** The only Agents SDK tool constructor: strict schema, and the feedback policy, always. */
export const sdkTool = (definition: SdkToolDefinition): Tool<unknown> =>
	tool({
		name: definition.name,
		description: definition.description,
		parameters: jsonObjectSchema(definition.parameters),
		strict: true,
		...(definition.isEnabled ? { isEnabled: definition.isEnabled } : {}),
		...(definition.needsApproval
			? {
					needsApproval: (_context, input, callId) => definition.needsApproval!(input, callId)
				}
			: {}),
		// By the time an error reaches the SDK's own handler, every tool error has
		// already become feedback. The SDK's rejection of the model's input is the
		// only correctable one left; anything else is terminal.
		errorFunction: (_context, error) => {
			definition.signal.throwIfAborted();
			if (error instanceof ModelBehaviorError && error.name === 'InvalidToolInputError')
				return JSON.stringify(
					toolFailure('VALIDATION', error.message, DOMAIN_ERROR_ADVICE.VALIDATION)
				);
			throw error;
		},
		execute: (input, _context, details) =>
			withToolFeedback(definition.signal, () =>
				definition.execute(input, details?.toolCall?.callId)
			)
	});
