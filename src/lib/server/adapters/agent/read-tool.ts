import { z } from 'zod';
import { agentPayloadResultSchema, type AgentPayload } from '$lib/models/agent/payload';
import type {
	AgentReadToolController,
	ToolResultReader
} from '$lib/server/controllers/agent/read-tool';
import type { PreparedAction } from '$lib/server/controllers/agent/tool-calls';
import { bindToolArguments } from './tool-call';
export class ToolResultBoundary<Result> implements ToolResultReader<Result> {
	read(result: Result): AgentPayload {
		const read = agentPayloadResultSchema.parse(result);
		if (read.kind === 'corrupt')
			throw new Error(`Tool output could not be represented as JSON: ${read.message}`);
		return read.value;
	}
}
/** Keep external parsing out of controllers and operation callbacks out of composition. */
export class BoundReadTool<Shape extends z.ZodRawShape> {
	constructor(
		private readonly parameters: z.ZodObject<Shape>,
		private readonly controller: AgentReadToolController<z.infer<z.ZodObject<Shape>>>
	) {}
	readonly prepare = (input: unknown): PreparedAction =>
		bindToolArguments(this.parameters, input, (parsed, payload) =>
			this.controller.run(parsed, payload)
		);
}
