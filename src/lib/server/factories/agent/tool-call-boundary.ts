// chisel-ignore-file structural:factory-contains-logic -- Protocol adapter owns validation and tool-local failures, not application composition.
import { z } from 'zod';
import { ValidationError } from '$lib/errors';
import type { ToolFailure } from '$lib/models/agent/tool-failure';
import { withToolFeedback } from '$lib/server/repositories/agent/sdk-tool';
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

/** What a call becomes before it runs. A failure is the envelope itself, so it is model feedback as is. */
export type ToolPreparation =
	| { readonly kind: 'ready'; readonly action: PreparedAction }
	| { readonly kind: 'approval_required'; readonly action: PreparedAction }
	| ToolFailure;

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

/** Preparation is tool work: an error raised while preparing is model feedback. */
export const prepareToolCall = (
	prepare: () => Promise<ToolPreparation>,
	signal: AbortSignal
): Promise<ToolPreparation> => withToolFeedback(signal, prepare);

/** Run a prepared action. Its errors propagate to the {@link withToolFeedback} around it. */
export const runToolAction = async (
	action: PreparedAction,
	signal: AbortSignal
): Promise<AgentPayload> => {
	signal.throwIfAborted();
	const result = readAgentPayload(await action.execute());
	if (result.kind === 'corrupt') throw new Error(result.message);
	return result.value;
};
