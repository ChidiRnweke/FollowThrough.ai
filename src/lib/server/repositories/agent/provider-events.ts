import { AgentProviderFailure } from '$lib/errors';
import {
	providerItemSchema,
	providerToolEventHeaderSchema,
	runItemStreamEventSchema,
	rawModelStreamEventSchema,
	type ProviderItem,
	type ProviderStreamEvent,
	type ProviderToolCall,
	type ProviderToolOutput
} from '$lib/models/agent';
import {
	readAgentPayload,
	readAgentPayloadObject,
	type AgentPayloadObject
} from '$lib/models/agent/payload';

const providerToolOutput = (value: unknown): ProviderToolOutput => {
	if (value === undefined || value === null) return { kind: 'none' };
	const read = readAgentPayload(value);
	return read.kind === 'valid'
		? { kind: 'value', value: read.value }
		: { kind: 'corrupt', message: read.message };
};

/**
 * Tool arguments, whether the provider sent them as JSON text or as an object.
 *
 * Both failures are fatal to the turn and always have been: a call whose
 * arguments nobody can read is a call that must not be presented as though it
 * ran.
 */
const providerArguments = (value: unknown): AgentPayloadObject => {
	if (value === undefined) return {};
	let candidate: unknown = value;
	if (typeof value === 'string') {
		try {
			candidate = JSON.parse(value);
		} catch (error) {
			throw new AgentProviderFailure(
				'The provider returned malformed JSON tool arguments',
				'MALFORMED_TOOL_ARGUMENTS',
				false,
				{ cause: error }
			);
		}
	}
	const read = readAgentPayloadObject(candidate);
	if (read.kind === 'corrupt')
		throw new AgentProviderFailure(
			'The provider returned tool arguments that were not an object',
			'MALFORMED_TOOL_ARGUMENTS',
			false,
			{ cause: new Error(read.message) }
		);
	return read.value;
};

const providerReasoningText = (item: ProviderItem): string => {
	const raw = item.rawItem;
	const parts = raw?.rawContent ?? raw?.content ?? raw?.summary;
	if (!parts) return '';
	return parts
		.map((part) => part.text)
		.filter((text) => text.length > 0)
		.join('\n');
};

const providerCall = (item: ProviderItem): ProviderToolCall => {
	const raw = item.rawItem;
	const name = item.toolName ?? raw?.name ?? 'tool';
	const args = providerArguments(item.arguments ?? raw?.arguments);
	return {
		callId: item.callId ?? raw?.callId ?? raw?.call_id ?? raw?.id,
		name,
		arguments: args,
		output: providerToolOutput(item.output ?? raw?.output)
	};
};

/**
 * One stream event as an arm of {@link ProviderStreamEvent}.
 *
 * Rejects malformed known tool events and unreadable arguments. Unfamiliar SDK
 * event types settle as `ignored`, so adding an event type cannot fail a turn.
 */
export const parseProviderStreamEvent = (event: unknown): ProviderStreamEvent => {
	const runItem = runItemStreamEventSchema.safeParse(event);
	if (runItem.success) {
		const { name, item } = runItem.data;
		if (name === 'tool_called') return { type: 'tool_called', call: providerCall(item) };
		if (name === 'tool_output') return { type: 'tool_output', call: providerCall(item) };
		if (name !== 'reasoning_item_created') return { type: 'ignored' };
		const text = providerReasoningText(item);
		return text ? { type: 'reasoning_item', text } : { type: 'ignored' };
	}
	if (providerToolEventHeaderSchema.safeParse(event).success)
		throw new AgentProviderFailure(
			'The provider returned a malformed tool event',
			'MALFORMED_TOOL_EVENT',
			false,
			{ cause: runItem.error }
		);
	const raw = rawModelStreamEventSchema.safeParse(event);
	if (!raw.success) return { type: 'ignored' };
	const { data } = raw.data;
	if (data.type === 'output_text_delta') return { type: 'text_delta', text: data.delta };
	const reasoning = data.event.choices?.[0]?.delta?.reasoning;
	return reasoning ? { type: 'reasoning_delta', text: reasoning } : { type: 'ignored' };
};

/**
 * A tool call held outside the stream — a `RunState` interruption parked on an
 * approval, which is not a stream event and never reaches the loop above.
 *
 * Absent when the value is not a tool item at all. The caller decides what that
 * means: for an approval it means a parked call nothing can be matched against,
 * which is a failure rather than a call to skip.
 */
export const parseProviderToolCall = (item: unknown): ProviderToolCall | undefined => {
	const parsed = providerItemSchema.safeParse(item);
	return parsed.success ? providerCall(parsed.data) : undefined;
};
