import { createSessionItemSerialization } from '$lib/server/factories/agent/session-item-serialization-factory';
import type { ActorContext } from '$lib/models/identity';
import type { ConversationId } from '$lib/models/agent';
import type { AgentSessionRepository } from '$lib/server/repositories/agent';
import { readToolFailure } from '$lib/server/repositories/agent/tool-failure';
import type { ReplayVirtualization } from '$lib/server/services/agent/conversations/replay-virtualizer';
import { AgentReplayVirtualizer } from '$lib/server/services/agent/conversations/replay-virtualizer';
import type { AgentFileRepository } from '$lib/server/repositories/agent-files/agent-files';
import type { TokenCounter } from '$lib/models/tokenization';
import { ConversationHistoryService } from '$lib/server/services/agent/conversations/history';
import { ConversationSessions } from '$lib/server/controllers/agent/conversation';
import { ConversationSessionStore } from '$lib/server/stores/agent/conversation';
import {
	ConversationSessionAdapter,
	ConversationJsonBoundary,
	type BufferedConversationSession
} from '$lib/server/adapters/agent/conversation';
export const createConversationSession = (
	repository: AgentSessionRepository,
	actor: ActorContext,
	conversationId: ConversationId,
	virtualizer: ReplayVirtualization
): BufferedConversationSession =>
	new ConversationSessionAdapter(
		new ConversationSessions(
			new ConversationHistoryService(repository),
			new ConversationSessionStore(),
			actor,
			conversationId,
			virtualizer,
			new ConversationJsonBoundary(readToolFailure)
		),
		createSessionItemSerialization()
	);

export const createReplayVirtualizer = (
	files: AgentFileRepository,
	tokens: TokenCounter
): ReplayVirtualization => new AgentReplayVirtualizer(files, tokens);
