import { AgentProviderFailure } from '$lib/errors';
import {
	providerItemSchema,
	providerRejectionSchema,
	providerToolEventHeaderSchema,
	runItemStreamEventSchema,
	rawModelStreamEventSchema,
	type ProviderItem,
	type ProviderStreamEvent,
	type ProviderToolArguments,
	type ProviderToolCall,
	type ProviderToolOutput
} from '$lib/models/agent';
import { readAgentPayload, readAgentPayloadObject } from '$lib/models/agent/payload';

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
 * Unreadable arguments are a value, not a throw. The SDK has already answered
 * that call with its own correction and the run continues; a reader that only
 * records the call must not veto the recovery.
 */
const providerArguments = (value: unknown): ProviderToolArguments => {
	if (value === undefined) return { kind: 'value', value: {} };
	let candidate: unknown = value;
	if (typeof value === 'string') {
		try {
			candidate = JSON.parse(value);
		} catch (error) {
			return {
				kind: 'corrupt',
				message: error instanceof Error ? error.message : String(error)
			};
		}
	}
	const read = readAgentPayloadObject(candidate);
	return read.kind === 'valid'
		? { kind: 'value', value: read.value }
		: { kind: 'corrupt', message: read.message };
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
 * Rejects malformed known tool events. Unreadable arguments stay a value on the
 * call (see {@link ProviderToolArguments}). Unfamiliar SDK
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
 * Absent when the value is not a tool item at all, or when its arguments cannot
 * be read. The SDK asks for approval only after it has parsed the arguments, so
 * an unreadable parked call is not something the model did. The caller decides
 * what that means: for an approval it means a parked call nothing can be matched
 * against, which is a failure rather than a call to skip.
 */
export const parseProviderToolCall = (
	item: unknown
): (ProviderToolCall & { readonly arguments: { readonly kind: 'value' } }) | undefined => {
	const parsed = providerItemSchema.safeParse(item);
	if (!parsed.success) return undefined;
	const call = providerCall(parsed.data);
	const { arguments: args } = call;
	return args.kind === 'value' ? { ...call, arguments: args } : undefined;
};

/**
 * Who rejected which request, as a suffix for the failure message: `" (provider OpenAI,
 * request req-1)"`, or `""` when the error carries neither. An operator needs both to find
 * the rejection in the provider's own records.
 */
export const providerRejectionContext = (error: unknown): string => {
	const read = providerRejectionSchema.safeParse(error);
	if (!read.success) return '';
	const parts = [
		read.data.error?.metadata?.provider_name &&
			`provider ${read.data.error.metadata.provider_name}`,
		read.data.requestID && `request ${read.data.requestID}`
	].filter((part): part is string => Boolean(part));
	return parts.length > 0 ? ` (${parts.join(', ')})` : '';
};
