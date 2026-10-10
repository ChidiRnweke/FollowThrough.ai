import { ContextChipsService } from '$lib/services/chat/chips';
import { ChatMentionService } from '$lib/services/chat/mentions';
import { AgentContext, type AgentContextController } from '$lib/controllers/agent/context';
import { AgentContextSelectionService } from '$lib/services/agent/context-selection';
export const agentContext: AgentContextController = new AgentContext(
	new ContextChipsService(),
	new AgentContextSelectionService(),
	new ChatMentionService()
);
