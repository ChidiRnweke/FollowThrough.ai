import { ToolLifecycleError } from '$lib/errors';
import type { ToolFailure } from '$lib/models/agent/tool-failure';
import type { AgentPayload, AgentPayloadObject } from '$lib/models/agent/payload';
export interface PreparedAction {
	readonly arguments: AgentPayloadObject;
	readonly execute: () => Promise<AgentPayload>;
}
export type ToolPreparation =
	| { readonly kind: 'ready'; readonly action: PreparedAction }
	| { readonly kind: 'approval_required'; readonly action: PreparedAction }
	| { readonly kind: 'failure'; readonly failure: ToolFailure };
export interface ToolCallReader {
	output(value: AgentPayload): AgentPayload;
	// audit-allow: no-unknown-type — Caught application/tool errors are forwarded unchanged to the failure boundary reader.
	failure(error: unknown): ToolFailure;
}
export interface AgentToolCallControl {
	prepare(action: () => Promise<ToolPreparation>, signal: AbortSignal): Promise<ToolPreparation>;
	execute(action: PreparedAction, signal: AbortSignal): Promise<AgentPayload>;
}
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
