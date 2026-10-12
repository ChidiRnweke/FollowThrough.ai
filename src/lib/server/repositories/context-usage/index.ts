import type { AuthoredLinkRecord, ToolContextLog } from '$lib/models/context-usage';
import type { ProjectId } from '$lib/models/projects';

/** Read-only: the log is the conversation journal, written by the agent archive. */
export interface ToolContextLogRepository {
	read(): Promise<ToolContextLog>;
}

/**
 * Read-only: the links the actor's records state between a project's items. Relationships,
 * skill usages and note attachments each have their own writer; this reads them as one map.
 */
export interface ProjectLinkRepository {
	read(projectId: ProjectId): Promise<readonly AuthoredLinkRecord[]>;
}
