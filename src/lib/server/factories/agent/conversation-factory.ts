import type { AgentInputItem } from '@openai/agents';
import type { ActorContext } from '$lib/models/identity';
import type { ConversationId } from '$lib/models/agent';
import type { AgentSessionRepository } from '$lib/server/repositories/agent';
import { toStoredSessionItem } from '$lib/server/repositories/agent/session-items';
import { readToolFailure } from '$lib/server/repositories/agent/tool-failure';
import { ConversationReplay, type ReplayVirtualizer } from '$lib/server/controllers/agent/replay';
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
	virtualizer: ReplayVirtualizer
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
		// The two independently declared SDK/storage unions have no structural relation for unknown provider rows.
		(item) => toStoredSessionItem(item) as AgentInputItem
	);

export const createReplayVirtualizer = (
	files: AgentFileRepository,
	tokens: TokenCounter
): ReplayVirtualizer =>
	new ConversationReplay(
		new AgentReplayVirtualizer(files, tokens),
		new ConversationJsonBoundary(readToolFailure)
	);
