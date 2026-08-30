import type {
	AssistantMessageSessionItem,
	FunctionCallResultSessionItem,
	FunctionCallSessionItem,
	PersistedSessionItem,
	ReasoningSessionItem,
	UserMessageSessionItem
} from '$lib/models/agent';

/**
 * Session items for specs, built as arms rather than as records.
 *
 * Before the union existed each spec assembled its own object literal, and they
 * disagreed with production in ways nothing could catch: an assistant message
 * whose `content` was a bare string, a `function_call_result` with no `status`.
 * Neither is a row the provider can produce, so a spec asserting on one proved
 * nothing about the code it was covering. Building through these keeps a fixture
 * to states production can actually reach.
 */

export const userItem = (text: string): UserMessageSessionItem => ({
	type: 'user_message',
	content: text
});

export const userItemWithImage = (text: string, image: string): UserMessageSessionItem => ({
	type: 'user_message',
	content: [
		{ type: 'input_text', text },
		{ type: 'input_image', image }
	]
});

export const assistantItem = (text: string): AssistantMessageSessionItem => ({
	type: 'assistant_message',
	status: 'completed',
	content: [{ type: 'output_text', text }]
});

export const callItem = (
	name: string,
	callId: string,
	args: string = '{}'
): FunctionCallSessionItem => ({
	type: 'function_call',
	name,
	callId,
	arguments: args
});

/** The stored shape of every result row: a single `text` part. */
export const resultItem = (
	name: string,
	callId: string,
	text: string
): FunctionCallResultSessionItem => ({
	type: 'function_call_result',
	name,
	callId,
	status: 'completed',
	output: { type: 'text', text }
});

export const stringResultItem = (
	name: string,
	callId: string,
	output: string
): FunctionCallResultSessionItem => ({
	type: 'function_call_result',
	name,
	callId,
	status: 'completed',
	output
});

export const reasoningItem = (text: string): ReasoningSessionItem => ({
	type: 'reasoning',
	content: [],
	rawContent: [{ type: 'reasoning_text', text }]
});

/** A row from a provider this code has not met, kept whole. */
export const unrecognisedItem = (type: string): PersistedSessionItem => ({
	type: 'unrecognised',
	raw: { type, payload: 'kept whole' },
	reason: `No arm matches a stored item of type '${type}'`
});
