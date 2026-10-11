import type { ActorContext } from '$lib/models/identity';
import type { ProjectId } from '$lib/models/projects';

/** One stored departure from the default. Absent rows mean "enabled". */
export interface StoredToolPreference {
	readonly toolName: string;
	readonly enabled: boolean;
}

export interface ToolPreferenceRepository {
	/** The user's workspace-wide selection. */
	listForUser(): Promise<readonly StoredToolPreference[]>;
	/** Departures from that selection scoped to one project. */
	listForProject(projectId: ProjectId): Promise<readonly StoredToolPreference[]>;
	upsertForUser(preference: StoredToolPreference): Promise<void>;
	upsertForProject(projectId: ProjectId, preference: StoredToolPreference): Promise<void>;
	/** Drops the override so the tool falls back to the user's selection. */
	deleteProjectOverride(projectId: ProjectId, toolName: string): Promise<void>;
}
