import type { ActorContext } from '$lib/models/identity';
import type { StoredAgentFile, StoreAgentFileInput } from '$lib/models/agent-files';

export interface AgentFileRepository {
	list(actor: ActorContext): Promise<readonly StoredAgentFile[]>;
	findByPath(actor: ActorContext, path: string): Promise<StoredAgentFile | undefined>;
	store(actor: ActorContext, input: StoreAgentFileInput): Promise<StoredAgentFile>;
}
