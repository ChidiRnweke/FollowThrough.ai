import type { AgentTool, ConnectorAgentTool } from '$lib/models/agent-tool-protocol';
import { agentPayloadResultSchema, type AgentPayload } from '$lib/models/agent/payload';
import { z } from 'zod';

/** The discovery answer agent and MCP hosts understand: each match with its exact input schema. */
export const describeTools = (
	permitted: readonly AgentTool[],
	connectors: readonly ConnectorAgentTool[],
	names: readonly string[]
): AgentPayload => {
	const payload = agentPayloadResultSchema.parse(
		names.map((name) => {
			const connector = connectors.find((candidate) => candidate.name === name);
			if (connector)
				return {
					name: connector.name,
					description: connector.description,
					classification:
						connector.approval === 'approval_required' ? 'asks first' : 'runs at once',
					input_schema: connector.inputSchema,
					callable_directly: true
				};
			const entry = permitted.find((candidate) => candidate.name === name);
			if (!entry) throw new Error(`Discovered tool is absent from its permitted catalog: ${name}`);
			return {
				name: entry.name,
				description: entry.description,
				classification: entry.classification,
				input_schema: z.toJSONSchema(entry.parameters, { io: 'input' }),
				callable_directly: true
			};
		})
	);
	if (payload.kind === 'corrupt') throw new Error(payload.message);
	return payload.value;
};
