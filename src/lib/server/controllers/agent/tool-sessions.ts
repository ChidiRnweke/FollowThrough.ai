import type { Tool } from '@openai/agents';
import type { ActorContext } from '$lib/models/identity';
import type { AgentRun, PendingAgentDecision, RunAgentInput } from '$lib/models/agent';
import type { ToolName } from '$lib/models/agent/tool-catalog';
import type { AgentToolExecutor } from '$lib/server/services/agent/runs/contracts';
import type { ToolPreferencesController } from './tool-preferences/controller';
import type { AgentToolReviewControl } from './tool-reviews';

export interface AgentToolRegistry {
	// audit-allow: no-unknown-type — The provider SDK owns the Tool context parameter; this interface does not inspect it.
	agentTools(alreadyPromoted?: readonly string[]): Tool<unknown>[];
	offeredToolNames(alreadyPromoted?: readonly string[]): ToolName[];
	catalog(): readonly { readonly name: string }[];
	reviewDecision(pending: PendingAgentDecision): PendingAgentDecision;
}
export interface AgentToolSessionInput {
	readonly actor: ActorContext;
	readonly request: RunAgentInput;
	readonly run: Pick<AgentRun, 'executionMode' | 'provenanceId' | 'model' | 'pendingDecisions'>;
	readonly executor: AgentToolExecutor;
	readonly signal: AbortSignal;
}
export interface ToolSessionAuthority {
	isEnabled(name: string): boolean;
}
export interface AgentToolSessionDependencies {
	readonly preferences: Pick<ToolPreferencesController, 'list'>;
	readonly create: (
		input: AgentToolSessionInput,
		authority: ToolSessionAuthority
	) => {
		readonly registry: AgentToolRegistry;
		readonly reviews: AgentToolReviewControl;
	};
}
export interface AgentToolSessionControl {
	open(input: AgentToolSessionInput): Promise<AgentToolRegistry>;
}

/** Current authority and saved review preparation are resolved before the runner sees its tools. */
export class AgentToolSessions implements AgentToolSessionControl {
	constructor(private readonly dependencies: () => AgentToolSessionDependencies) {}
	async open(input: AgentToolSessionInput): Promise<AgentToolRegistry> {
		const dependencies = this.dependencies();
		const preferences = await dependencies.preferences.list(
			input.actor,
			input.request.projectId ? { projectId: input.request.projectId } : {}
		);
		const disabled = preferences
			.filter((preference) => !preference.enabled)
			.map((preference) => preference.name);
		const session = dependencies.create(input, { isEnabled: (name) => !disabled.includes(name) });
		session.reviews.restore(input.run.pendingDecisions);
		return session.registry;
	}
}
