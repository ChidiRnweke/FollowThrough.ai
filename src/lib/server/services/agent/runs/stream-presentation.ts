import type { AgentEvent, AgentToolOutcome, ProviderStreamEvent } from '$lib/models/agent';
import type { AgentToolName } from '$lib/models/agent/tool-catalog';
export interface AgentStreamPresentation {
	outcome(
		identity: { readonly callId?: string; readonly name: AgentToolName },
		output: AgentToolOutcome
	): AgentEvent;
	reasoning(
		event: ProviderStreamEvent,
		streamed: boolean
	): { readonly event?: AgentEvent; readonly streamed: boolean };
}
export class AgentStreamPresentationService implements AgentStreamPresentation {
	outcome(
		identity: { readonly callId?: string; readonly name: AgentToolName },
		output: AgentToolOutcome
	): AgentEvent {
		switch (output.kind) {
			case 'none':
				return { type: 'tool_succeeded', ...identity };
			case 'corrupt':
				return {
					type: 'tool_failed',
					...identity,
					failure: `The tool result could not be read. ${output.message}`
				};
			case 'succeeded':
				return { type: 'tool_succeeded', ...identity, output: output.value };
			case 'reported_failure':
				return {
					type: 'tool_reported_failure',
					...identity,
					output: output.value,
					failure: output.failure
				};
		}
	}
	reasoning(
		event: ProviderStreamEvent,
		streamed: boolean
	): { readonly event?: AgentEvent; readonly streamed: boolean } {
		if (event.type === 'reasoning_delta')
			return { event: { type: 'reasoning_delta', text: event.text }, streamed: true };
		if (event.type !== 'reasoning_item') return { streamed };
		return streamed
			? { streamed: false }
			: { event: { type: 'reasoning_delta', text: event.text }, streamed: false };
	}
}
