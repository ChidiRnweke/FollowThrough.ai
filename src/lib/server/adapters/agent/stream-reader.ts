import type { AgentStreamReader } from '$lib/server/controllers/agent/execution';
import {
	agentToolNameSchema,
	type AgentToolOutcome,
	type ProviderToolOutput
} from '$lib/models/agent';
import type { AgentToolName } from '$lib/models/agent/tool-catalog';

import type { AgentPayload } from '$lib/models/agent/payload';
import { AgentProviderFailure } from '$lib/errors';
export class AgentStreamBoundary implements AgentStreamReader {
	constructor(private readonly readFailure: (value: AgentPayload) => string | undefined) {}
	name(name: string): AgentToolName {
		const read = agentToolNameSchema.safeParse(name).data;
		if (read === undefined)
			throw new AgentProviderFailure(
				`The provider called "${name}", which is not a tool this agent offers`,
				'UNKNOWN_TOOL_CALL',
				false
			);
		return read;
	}
	output(output: ProviderToolOutput): AgentToolOutcome {
		if (output.kind !== 'value') return output;
		const failure = this.readFailure(output.value);
		return failure === undefined
			? { kind: 'succeeded', value: output.value }
			: { kind: 'reported_failure', value: output.value, failure };
	}
}
