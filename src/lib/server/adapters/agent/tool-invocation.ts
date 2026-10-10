import { ToolLifecycleError } from '$lib/errors';
import type {
	AgentToolCallControl,
	AgentToolInvocationControl,
	PreparedAction,
	ToolPreparation
} from '$lib/models/agent-tool-protocol';
import type { AgentPayload } from '$lib/models/agent/payload';
import type { ToolInvocationState } from '$lib/models/agent-tool-protocol';
export class AgentToolInvocation implements AgentToolInvocationControl {
	constructor(
		private readonly state: ToolInvocationState,
		private readonly calls: AgentToolCallControl,
		private readonly prepareAction: (
			input: AgentPayload,
			callId: string | undefined,
			phase: 'approval' | 'execute'
		) => Promise<ToolPreparation>,
		private readonly signal: AbortSignal
	) {}
	prepare(
		input: AgentPayload,
		callId: string | undefined,
		phase: 'approval' | 'execute'
	): Promise<ToolPreparation> {
		this.signal.throwIfAborted();
		const serialized = JSON.stringify(input);
		const prior = callId === undefined ? undefined : this.state.get(callId);
		if (prior) {
			if (prior.input !== serialized)
				throw new ToolLifecycleError('A tool call identity was reused with different arguments');
			return prior.preparation;
		}
		const preparation = this.calls.prepare(
			() => this.prepareAction(input, callId, phase),
			this.signal
		);
		if (callId !== undefined) this.state.save(callId, { input: serialized, preparation });
		return preparation;
	}
	execute(action: PreparedAction): Promise<AgentPayload> {
		return this.calls.execute(action, this.signal);
	}
}
