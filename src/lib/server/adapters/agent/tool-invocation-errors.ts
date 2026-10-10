import { ToolLifecycleError } from '$lib/errors';
import type {
	AgentToolCallControl,
	PreparedAction,
	ToolCallReader,
	ToolPreparation
} from '$lib/models/agent-tool-protocol';
import type { AgentPayload } from '$lib/models/agent/payload';
export class AgentToolCalls implements AgentToolCallControl {
	constructor(private readonly reader: ToolCallReader) {}
	async prepare(
		action: () => Promise<ToolPreparation>,
		signal: AbortSignal
	): Promise<ToolPreparation> {
		signal.throwIfAborted();
		try {
			return await action();
		} catch (error) {
			signal.throwIfAborted();
			if (error instanceof ToolLifecycleError) throw error;
			return { kind: 'failure', failure: this.reader.failure(error) };
		}
	}
	async execute(action: PreparedAction, signal: AbortSignal): Promise<AgentPayload> {
		signal.throwIfAborted();
		try {
			return this.reader.output(await action.execute());
		} catch (error) {
			signal.throwIfAborted();
			if (error instanceof ToolLifecycleError) throw error;
			return { ...this.reader.failure(error), kind: 'failure' };
		}
	}
}
