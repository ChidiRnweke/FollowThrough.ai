import type { AgentMemoryProposalInput, AgentToolInput } from '$lib/models/agent-tool-inputs';
import type { ActorContext } from '$lib/models/identity';
import type { ProjectId } from '$lib/models/projects';
import type { ProvenanceId } from '$lib/models/provenance';
import type { AgentSettingsController } from '$lib/server/controllers/agent/settings/controller';
import type { ToolPreferencesController } from '$lib/server/controllers/agent/tool-preferences/controller';
import type { TrustPoliciesController } from '$lib/server/controllers/agent/trust-policies/controller';
import type { MemoryController } from '$lib/server/controllers/memory/controller';
import type { AgentToolPresentation } from '$lib/server/services/agent/runs/tool-views';
import type { AgentToolOutput } from '../tool-outputs';
interface MemoryAndPreferencesToolOperationsDependencies {
	memory(): Pick<MemoryController, 'list' | 'propose'>;
	trustPolicies(): Pick<TrustPoliciesController, 'list' | 'update'>;
	toolPreferences(): Pick<ToolPreferencesController, 'list' | 'setEnabled'>;
	agentSettings(): Pick<
		AgentSettingsController,
		'getPreferences' | 'updatePreferences' | 'listModels'
	>;
}
export interface MemoryAndPreferencesToolOperations {
	list_project_memory(
		input: AgentToolInput<'list_project_memory'>
	): Promise<AgentToolOutput<'list_project_memory'>>;
	list_user_memory(): Promise<AgentToolOutput<'list_user_memory'>>;
	propose_memory_change(
		input: AgentMemoryProposalInput
	): Promise<AgentToolOutput<'propose_memory_change'>>;
	list_trust_policies(): Promise<AgentToolOutput<'list_trust_policies'>>;
	update_trust_policy(
		input: AgentToolInput<'update_trust_policy'>
	): Promise<AgentToolOutput<'update_trust_policy'>>;
	list_tool_preferences(
		input: AgentToolInput<'list_tool_preferences'>
	): Promise<AgentToolOutput<'list_tool_preferences'>>;
	set_tool_enabled(
		input: AgentToolInput<'set_tool_enabled'>
	): Promise<AgentToolOutput<'set_tool_enabled'>>;
	get_agent_preferences(): Promise<AgentToolOutput<'get_agent_preferences'>>;
	update_agent_preferences(
		input: AgentToolInput<'update_agent_preferences'>
	): Promise<AgentToolOutput<'update_agent_preferences'>>;
	list_agent_models(): Promise<AgentToolOutput<'list_agent_models'>>;
}
export class MemoryAndPreferencesToolOperationsController implements MemoryAndPreferencesToolOperations {
	constructor(
		private readonly controllers: MemoryAndPreferencesToolOperationsDependencies,
		private readonly actor: ActorContext,
		private readonly provenanceId: ProvenanceId,
		private readonly toolPresentation: AgentToolPresentation
	) {}
	async list_project_memory(
		input: AgentToolInput<'list_project_memory'>
	): Promise<AgentToolOutput<'list_project_memory'>> {
		return {
			entries: (
				await this.controllers.memory().list(this.actor, {
					projectId: input.projectId as ProjectId,
					sharedOnly: true
				})
			).entries.map((value) => this.toolPresentation.projectMemory(value))
		};
	}
	async list_user_memory(): Promise<AgentToolOutput<'list_user_memory'>> {
		const entries = (
			await this.controllers.memory().list(this.actor, { sharedOnly: true })
		).entries.map((value) => this.toolPresentation.projectMemory(value));
		return { entries };
	}
	async propose_memory_change(
		input: AgentMemoryProposalInput
	): Promise<AgentToolOutput<'propose_memory_change'>> {
		const { confidence, ...payload } = input;
		return this.controllers.memory().propose(this.actor, {
			...payload,
			provenanceId: this.provenanceId,
			...(confidence !== undefined ? { confidence } : {})
		});
	}
	async list_trust_policies(): Promise<AgentToolOutput<'list_trust_policies'>> {
		return this.controllers.trustPolicies().list(this.actor);
	}
	async update_trust_policy(
		input: AgentToolInput<'update_trust_policy'>
	): Promise<AgentToolOutput<'update_trust_policy'>> {
		return this.controllers.trustPolicies().update(this.actor, input);
	}
	async list_tool_preferences(
		input: AgentToolInput<'list_tool_preferences'>
	): Promise<AgentToolOutput<'list_tool_preferences'>> {
		return this.controllers
			.toolPreferences()
			.list(this.actor, input.projectId ? { projectId: input.projectId as ProjectId } : {});
	}
	async set_tool_enabled(
		input: AgentToolInput<'set_tool_enabled'>
	): Promise<AgentToolOutput<'set_tool_enabled'>> {
		return this.controllers.toolPreferences().setEnabled(this.actor, {
			toolName: input.toolName,
			enabled: input.enabled,
			...(input.projectId ? { projectId: input.projectId as ProjectId } : {})
		});
	}
	async get_agent_preferences(): Promise<AgentToolOutput<'get_agent_preferences'>> {
		return this.controllers.agentSettings().getPreferences(this.actor);
	}
	async update_agent_preferences(
		input: AgentToolInput<'update_agent_preferences'>
	): Promise<AgentToolOutput<'update_agent_preferences'>> {
		const previous = await this.controllers.agentSettings().getPreferences(this.actor);
		const updated = await this.controllers.agentSettings().updatePreferences(this.actor, input);
		return { ...updated, previous };
	}
	async list_agent_models(): Promise<AgentToolOutput<'list_agent_models'>> {
		return this.controllers.agentSettings().listModels(this.actor);
	}
}
