import { workspaceSession, workspaceViews } from '$lib/factories/workspace/session';
import type { WorkspaceSession } from '$lib/controllers/workspace/workspace';
import type { ChatHistory, ChatHistorySource } from '$lib/stores/agent/chat.svelte';
import type { ConversationId } from '$lib/models/agent';

/** A chat's history as the open account's workspace holds it; it ends with that account. */
export const workspaceChatHistory = (session: WorkspaceSession): ChatHistorySource => {
	const bound = () => workspaceSession.current === session && session.resources.active;
	return {
		get writable() {
			return bound() && session.resources.online;
		},
		async read(conversationId: ConversationId): Promise<ChatHistory> {
			if (!bound()) return { kind: 'stopped' };
			const opened = await workspaceSession.read(
				{ type: 'conversations', id: [conversationId] },
				'chat'
			);
			if (!bound()) return { kind: 'stopped' };
			if (opened.kind === 'failure') return opened;
			if (opened.kind === 'absent')
				return { kind: 'failure', message: 'This chat is no longer available' };
			// Messages and runs are their own records; read them once the inventory is local.
			await session.resources.prepare();
			if (!bound()) return { kind: 'stopped' };
			const conversation = workspaceViews.conversation(conversationId);
			if (!conversation) return { kind: 'failure', message: 'This chat is no longer available' };
			return {
				kind: 'ready',
				conversation,
				messages: workspaceViews.messages(conversationId),
				latestRun: workspaceViews.latestRun(conversationId)
			};
		},
		async refresh() {
			await workspaceSession.synchronize();
		}
	};
};
