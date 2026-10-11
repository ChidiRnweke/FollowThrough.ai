import { agentResourcePathSchema, type AgentResourcePath } from '$lib/models/agent-files';
import type { StoredAgentFile, StoreAgentFileInput } from '$lib/models/agent-files';

export interface AgentFileRepository {
	list(): Promise<readonly StoredAgentFile[]>;
	findByPath(path: string): Promise<StoredAgentFile | undefined>;
	store(input: StoreAgentFileInput): Promise<StoredAgentFile>;
}

export const readAgentResourcePath = (path: string): AgentResourcePath | undefined =>
	agentResourcePathSchema.safeParse(path).data;
