import type { ToolResultReader } from '$lib/models/agent-tool-context';
import {
	agentPayloadObjectResultSchema,
	agentPayloadResultSchema,
	type AgentPayload,
	type AgentPayloadObject
} from '$lib/models/agent/payload';
import { z } from 'zod';
/** Validate values at the JSON boundary before application result filtering. */
export class ToolResultBoundary implements ToolResultReader {
	json<Result>(result: Result): z.core.util.JSONType {
		return z.json().parse(result);
	}
	read<Result>(result: Result): AgentPayload {
		const read = agentPayloadResultSchema.parse(result);
		if (read.kind === 'corrupt')
			throw new Error(`Tool output could not be represented as JSON: ${read.message}`);
		return read.value;
	}
	arguments<Input>(input: Input): AgentPayloadObject {
		const read = agentPayloadObjectResultSchema.parse(input);
		if (read.kind === 'corrupt') throw new Error(read.message);
		return read.value;
	}
}
