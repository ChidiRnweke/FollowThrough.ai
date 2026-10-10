import { z } from 'zod';
import { agentPayloadResultSchema, type AgentPayload } from '$lib/models/agent/payload';
import type { ToolClassification } from '$lib/models/agent';
import type { ToolDiscoveryPresentation } from '$lib/server/controllers/agent/tool-discovery';

export interface ToolSchemaDefinition {
	readonly name: string;
	readonly description: string;
	readonly classification: ToolClassification;
	readonly parameters: z.ZodObject;
}

/** Convert application schemas to the exact discovery payload understood by agent and MCP hosts. */
export class ToolCatalogBoundary implements ToolDiscoveryPresentation {
	constructor(private readonly definitions: readonly ToolSchemaDefinition[]) {}
	describe(names: readonly string[]): AgentPayload {
		const payload = agentPayloadResultSchema.parse(
			names.map((name) => {
				const definition = this.definitions.find((definition) => definition.name === name);
				if (!definition)
					throw new Error(`Discovered tool is absent from its permitted catalog: ${name}`);
				return {
					name: definition.name,
					description: definition.description,
					classification: definition.classification,
					input_schema: z.toJSONSchema(definition.parameters, { io: 'input' }),
					callable_directly: true
				};
			})
		);
		if (payload.kind === 'corrupt') throw new Error(payload.message);
		return payload.value;
	}
}
