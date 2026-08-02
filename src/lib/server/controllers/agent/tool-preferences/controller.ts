import type { ActorContext } from '$lib/models/identity';
import type { ProjectId } from '$lib/models/projects';
import type { ToolPreference } from '$lib/models/agent';
import type { ToolPreferenceStore } from '$lib/server/services/agent/tools/preferences';

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
 * than being sent to a settings page, and the locked-tool guard in the store
 * keeps that from becoming a way for the agent to strand itself.
 */
export interface ToolPreferencesController {
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
}

export interface ToolPreferencesDependencies {
	preferences: ToolPreferenceStore;
}

export class ToolPreferences implements ToolPreferencesController {
	constructor(private readonly dependencies: ToolPreferencesDependencies) {}

	list(
		actor: ActorContext,
		input: { projectId?: ProjectId } = {}
	): Promise<readonly ToolPreference[]> {
		return this.dependencies.preferences.view(actor, input.projectId);
	}

	async setEnabled(
		actor: ActorContext,
		input: SetToolEnabledInput
	): Promise<readonly ToolPreference[]> {
		await this.dependencies.preferences.setEnabled(actor, {
			toolName: input.toolName,
			enabled: input.enabled,
			...(input.projectId ? { projectId: input.projectId } : {})
		});
		// The resolved view is returned so a caller — the settings page or the
		// agent — sees the effect of its own write without a second round trip.
		return this.dependencies.preferences.view(actor, input.projectId);
	}

	async clearOverride(
		actor: ActorContext,
		input: ClearToolOverrideInput
	): Promise<readonly ToolPreference[]> {
		await this.dependencies.preferences.clearOverride(actor, input.projectId, input.toolName);
		return this.dependencies.preferences.view(actor, input.projectId);
	}
}
