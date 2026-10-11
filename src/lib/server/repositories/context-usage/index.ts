import type { ToolContextLog } from '$lib/models/context-usage';

/** Read-only: the log is the conversation journal, written by the agent archive. */
export interface ToolContextLogRepository {
	read(): Promise<ToolContextLog>;
}
