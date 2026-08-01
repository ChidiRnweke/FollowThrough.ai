import type { ActorContext } from '$lib/models/identity';
import type { ProjectId } from '$lib/models/projects';
import type { ToolPreference } from '$lib/models/agent';
import type { ToolPreferenceStore } from '$lib/server/services/agent/tools/preferences';

export interface SetToolEnabledInput {
	readonly toolName: string;
	readonly enabled: boolean;
	/** Omitted, this is the workspace default; given, an override for one project. */
	readonly projectId?: ProjectId;
}

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
	list(actor: ActorContext, input?: { projectId?: ProjectId }): Promise<readonly ToolPreference[]>;
	setEnabled(actor: ActorContext, input: SetToolEnabledInput): Promise<readonly ToolPreference[]>;
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
