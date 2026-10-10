import type { AgentToolReviewControl } from '$lib/models/agent-tool-reviews';
import type {
	AgentToolRegistry,
	AgentToolSessionInput,
	ToolSessionAuthority
} from '$lib/models/agent-tool-session';
import { type AgentToolSessionControl } from '$lib/server/controllers/agent/tool-sessions';

export interface ToolSessionConstruction {
	(
		input: AgentToolSessionInput,
		authority: ToolSessionAuthority
	): { readonly registry: AgentToolRegistry; readonly reviews: AgentToolReviewControl };
}
/** Restore the provider's saved preparation before exposing protocol tools. */
export class AgentToolSessionAdapter {
	constructor(
		private readonly sessions: AgentToolSessionControl,
		private readonly create: ToolSessionConstruction
	) {}
	async open(input: AgentToolSessionInput): Promise<AgentToolRegistry> {
		const disabled = await this.sessions.authority(input.actor, input.request.projectId);
		const session = this.create(input, { isEnabled: (name) => !disabled.includes(name) });
		session.reviews.restore(input.run.pendingDecisions);
		return session.registry;
	}
}
