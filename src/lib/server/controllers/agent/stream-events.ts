import type {
	AgentEvent,
	AgentToolOutcome,
	ProviderStreamEvent,
	ProviderToolOutput
} from '$lib/models/agent';
import type { AgentToolName } from '$lib/models/agent/tool-catalog';
import type { AgentStreamStore } from '$lib/server/stores/agent/stream';
import type { AgentStreamPresentation } from '$lib/server/services/agent/runs/stream-presentation';
import { AgentProviderFailure } from '$lib/errors';
export interface AgentStreamReader {
	name(name: string): AgentToolName;
	output(output: ProviderToolOutput): AgentToolOutcome;
}
export interface AgentEventMapper {
	map(event: ProviderStreamEvent): AgentEvent | undefined;
}
export interface AgentStreamMappings {
	readonly tools: AgentEventMapper;
	readonly reasoning: AgentEventMapper;
}
export class AgentToolEvents implements AgentEventMapper {
	constructor(
		private readonly state: AgentStreamStore,
		private readonly reader: AgentStreamReader,
		private readonly presentation: AgentStreamPresentation
	) {}
	map(event: ProviderStreamEvent): AgentEvent | undefined {
		if (event.type === 'tool_called') {
			const { call } = event;
			if (call.callId === undefined)
				throw new AgentProviderFailure(
					`The provider opened a call to "${call.name}" without an identifier`,
					'UNIDENTIFIED_TOOL_CALL',
					false
				);
			this.state.remember(call.callId, call);
			return {
				type: 'tool_started',
				callId: call.callId,
				name: this.reader.name(call.name),
				arguments: call.arguments
			};
		}
		if (event.type !== 'tool_output') return undefined;
		const { call } = event;
		const active = this.state.activeCalls;
		const soleActive = active.size === 1 ? active.keys().next().value : undefined;
		const callId = call.callId ?? soleActive;
		const known = callId === undefined ? undefined : active.get(callId);
		if (callId !== undefined) this.state.forget(callId);
		const identity = {
			...(callId === undefined ? {} : { callId }),
			name: this.reader.name(known?.name ?? call.name)
		};
		return this.presentation.outcome(identity, this.reader.output(call.output));
	}
}
export class AgentReasoningEvents implements AgentEventMapper {
	constructor(
		private readonly state: AgentStreamStore,
		private readonly presentation: AgentStreamPresentation
	) {}
	map(event: ProviderStreamEvent): AgentEvent | undefined {
		const next = this.presentation.reasoning(event, this.state.streamed);
		this.state.setStreamed(next.streamed);
		return next.event;
	}
}
