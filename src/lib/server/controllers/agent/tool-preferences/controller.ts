import type { ToolResultReader } from '$lib/models/agent-tool-context';
import type { AgentToolInput } from '$lib/models/agent-tool-inputs';
import type { AgentPayload } from '$lib/models/agent/payload';
import type { AgentToolPresentation } from '$lib/server/services/agent/runs/tool-views';
import type { AgentPayloadInspection } from '$lib/services/agent/payload';
import type { AgentToolCatalog } from '$lib/services/agent/tool-catalog';
import type { WorkspaceCommandRules } from '$lib/services/workspace/commands';

import { ValidationError } from '$lib/errors';
import type { ToolPreference } from '$lib/models/agent';
import type { ActorContext } from '$lib/models/identity';
import type { ProjectId } from '$lib/models/projects';
import type { AtomicOperation } from '$lib/models/workspace';
import type {
	ToolPreferenceMutationRequest,
	WorkspaceMutationResult
} from '$lib/models/workspace-mutations';
import type { ToolPreferenceCapability } from '$lib/server/services/agent/tools/preferences';
import type { WorkspaceMutationGuard } from '$lib/server/services/workspace/mutation-receipts';

/** Enables or disables a tool, either as the workspace default or as a per-project override. */
export interface SetToolEnabledInput {
	readonly toolName: string;
	readonly enabled: boolean;
	/** Omitted, this is the workspace default; given, an override for one project. */
	readonly projectId?: ProjectId;
}

/** Removes a per-project override so a tool falls back to the workspace default. */
export interface ClearToolOverrideInput {
	readonly toolName: string;
	readonly projectId: ProjectId;
}

/**
 * Which tools the agent may reach. Deliberately agent-callable: a user asking
 * the agent to "stop touching my todos" should be able to have it done rather
 * than being sent to a settings page, and the locked-tool guard in the capability
 * keeps that from becoming a way for the agent to strand itself.
 */
export interface ToolPreferencesController {
	synchronize(
		actor: ActorContext,
		input: ToolPreferenceMutationRequest
	): Promise<WorkspaceMutationResult>;
	/** List tool enablement, resolved for the workspace default or a specific project. */
	list(actor: ActorContext, input?: { projectId?: ProjectId }): Promise<readonly ToolPreference[]>;
	/**
	 * Enable or disable a tool, as the workspace default or a per-project override, and
	 * return the resolved view — the caller (settings page or agent) sees the effect of
	 * its own write without a second round trip.
	 */
	setEnabled(actor: ActorContext, input: SetToolEnabledInput): Promise<readonly ToolPreference[]>;
	/** Remove a per-project override, returning the resolved view after the fallback applies. */
	clearOverride(
		actor: ActorContext,
		input: ClearToolOverrideInput
	): Promise<readonly ToolPreference[]>;

	agentListToolPreferences(
		actor: ActorContext,
		input: AgentToolInput<'list_tool_preferences'>
	): Promise<AgentPayload>;
	agentSetToolEnabled(
		actor: ActorContext,
		input: AgentToolInput<'set_tool_enabled'>
	): Promise<AgentPayload>;
}

export interface ToolPreferencesDependencies {
	readonly toolPresentation: AgentToolPresentation;
	readonly toolPayloads: AgentPayloadInspection;
	readonly toolResults: ToolResultReader;

	syncMutations: WorkspaceMutationGuard;
	transactionRunner: AtomicOperation;
	syncRetry: 'database-only' | 'never';
	preferences: ToolPreferenceCapability;
	catalog: Pick<AgentToolCatalog, 'entries'>;
}

export class ToolPreferences implements ToolPreferencesController {
	async synchronize(
		actor: ActorContext,
		input: ToolPreferenceMutationRequest
	): Promise<WorkspaceMutationResult> {
		try {
			return await this.dependencies.transactionRunner.run(
				async () => {
					const target = this.workspaceCommandRules.mutationResource(input.command);
					const prepared = await this.dependencies.syncMutations.prepare(actor, input, {
						identity: target,
						key: this.workspaceCommandRules.workspaceResourceKey(target)
					});
					if (prepared.kind === 'finished') return prepared.result;
					await this.applySynchronizedCommand(actor, input);
					return this.dependencies.syncMutations.complete(actor, input, target);
				},
				{ retry: this.dependencies.syncRetry }
			);
		} catch (error) {
			if (!(error instanceof Error)) throw error;
			return this.dependencies.syncMutations.reject(error);
		}
	}

	private async applySynchronizedCommand(
		actor: ActorContext,
		input: ToolPreferenceMutationRequest
	): Promise<void> {
		if (input.command.userId !== actor.userId)
			throw new ValidationError('The preferences belong to another account');
		const command = input.command;
		if (command.kind === 'resetProjectToolOverride') await this.clearOverride(actor, command);
		else await this.setEnabled(actor, command);
	}
	constructor(
		private readonly workspaceCommandRules: WorkspaceCommandRules,
		private readonly dependencies: ToolPreferencesDependencies
	) {}

	list(
		actor: ActorContext,
		input: { projectId?: ProjectId } = {}
	): Promise<readonly ToolPreference[]> {
		return this.dependencies.preferences.view(
			actor,
			this.dependencies.catalog.entries(),
			input.projectId
		);
	}

	async setEnabled(
		actor: ActorContext,
		input: SetToolEnabledInput
	): Promise<readonly ToolPreference[]> {
		await this.dependencies.preferences.setEnabled(actor, this.dependencies.catalog.entries(), {
			toolName: input.toolName,
			enabled: input.enabled,
			...(input.projectId ? { projectId: input.projectId } : {})
		});
		// The resolved view is returned so a caller — the settings page or the
		// agent — sees the effect of its own write without a second round trip.
		return this.dependencies.preferences.view(
			actor,
			this.dependencies.catalog.entries(),
			input.projectId
		);
	}

	async clearOverride(
		actor: ActorContext,
		input: ClearToolOverrideInput
	): Promise<readonly ToolPreference[]> {
		await this.dependencies.preferences.clearOverride(
			actor,
			this.dependencies.catalog.entries(),
			input.projectId,
			input.toolName
		);
		return this.dependencies.preferences.view(
			actor,
			this.dependencies.catalog.entries(),
			input.projectId
		);
	}

	async agentListToolPreferences(
		actor: ActorContext,
		input: AgentToolInput<'list_tool_preferences'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			return this.list(actor, input.projectId ? { projectId: input.projectId as ProjectId } : {});
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	async agentSetToolEnabled(
		actor: ActorContext,
		input: AgentToolInput<'set_tool_enabled'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			return this.setEnabled(actor, {
				toolName: input.toolName,
				enabled: input.enabled,
				...(input.projectId ? { projectId: input.projectId as ProjectId } : {})
			});
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
}
