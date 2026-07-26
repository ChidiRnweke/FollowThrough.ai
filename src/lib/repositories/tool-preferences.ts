import type { ActorContext, ProjectId } from '../models';

/** One stored departure from the default. Absent rows mean "enabled". */
export interface StoredToolPreference {
	readonly toolName: string;
	readonly enabled: boolean;
}

export interface ToolPreferenceRepository {
	/** The user's workspace-wide selection. */
	listForUser(actor: ActorContext): Promise<readonly StoredToolPreference[]>;
	/** Departures from that selection scoped to one project. */
	listForProject(
		actor: ActorContext,
		projectId: ProjectId
	): Promise<readonly StoredToolPreference[]>;
	upsertForUser(actor: ActorContext, preference: StoredToolPreference): Promise<void>;
	upsertForProject(
		actor: ActorContext,
		projectId: ProjectId,
		preference: StoredToolPreference
	): Promise<void>;
	/** Drops the override so the tool falls back to the user's selection. */
	deleteProjectOverride(actor: ActorContext, projectId: ProjectId, toolName: string): Promise<void>;
}
