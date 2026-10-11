import { ValidationError } from '$lib/errors';
import type { PreparedAction } from '$lib/models/agent-tool-protocol';
import {
	agentPayloadObjectResultSchema,
	agentPayloadResultSchema,
	type AgentPayload,
	type AgentPayloadObject
} from '$lib/models/agent/payload';
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

/** A tool's output, checked to be JSON the model and the event log can carry. */
export const toolOutput = (value: AgentPayload): AgentPayload => {
	const result = agentPayloadResultSchema.parse(value);
	if (result.kind === 'corrupt') throw new Error(result.message);
	return result.value;
};
