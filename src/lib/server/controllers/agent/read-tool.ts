import type { AgentPayload, AgentPayloadObject } from '$lib/models/agent/payload';
import type { AgentPayloadInspection } from '$lib/services/agent/payload';
export interface ToolResultReader<Result> {
	read(result: Result): AgentPayload;
}
export interface AgentReadToolController<Input> {
	run(input: Input, payload: AgentPayloadObject): Promise<AgentPayload>;
}
/** Execute one read, validate its result at the adapter, then apply the requested date range. */
export class AgentReadTool<Input, Result> implements AgentReadToolController<Input> {
	constructor(
		private readonly execute: (input: Input) => Promise<Result>,
		private readonly reader: ToolResultReader<Result>,
		private readonly payloads: AgentPayloadInspection
	) {}
	async run(input: Input, payload: AgentPayloadObject): Promise<AgentPayload> {
		const result = this.reader.read(await this.execute(input));
		return this.payloads.filterResult(result, payload);
	}
}
