import type { AgentRunEventRecord, AgentRunId, ConversationId } from '$lib/models/agent';
import type { AgentRunTransport } from './contracts';
import {
	cancelAgentRun,
	decideAgentRunBatch,
	getAgentRun,
	getSession,
	retryAgentRun,
	submitAgentRun
} from '$lib/remote/agent/chat.remote';

export class RemoteAgentRunTransport implements AgentRunTransport {
	async submit(input: Parameters<AgentRunTransport['submit']>[0]) {
		const {
			images,
			contextImages,
			selections,
			contextNoteIds,
			requestedSkillNames,
			requestedSkillNoteIds,
			appContext,
			...scalars
		} = input;
		const mutableAppContext = appContext
			? (() => {
					const { workbench, recentInteractions, ...context } = appContext;
					return {
						...context,
						recentInteractions: [...recentInteractions],
						...(workbench
							? {
									workbench: (() => {
										const { openTabs, visiblePanes, openChatTabs, ...workbenchState } = workbench;
										return {
											...workbenchState,
											openTabs: [...openTabs],
											visiblePanes: [...visiblePanes],
											...(openChatTabs ? { openChatTabs: [...openChatTabs] } : {})
										};
									})()
								}
							: {})
					};
				})()
			: undefined;
		return submitAgentRun({
			...scalars,
			...(images ? { images: [...images] } : {}),
			...(contextImages ? { contextImages: [...contextImages] } : {}),
			...(selections ? { selections: [...selections] } : {}),
			...(contextNoteIds ? { contextNoteIds: [...contextNoteIds] } : {}),
			...(requestedSkillNames ? { requestedSkillNames: [...requestedSkillNames] } : {}),
			...(requestedSkillNoteIds ? { requestedSkillNoteIds: [...requestedSkillNoteIds] } : {}),
			...(mutableAppContext ? { appContext: mutableAppContext } : {})
		});
	}

	async get(runId: AgentRunId) {
		return getAgentRun({ runId });
	}

	async decideMany(input: Parameters<AgentRunTransport['decideMany']>[0]) {
		return decideAgentRunBatch({ ...input, callIds: [...input.callIds] });
	}

	async cancel(runId: AgentRunId) {
		return cancelAgentRun({ runId });
	}

	async retry(runId: AgentRunId, requestId: string) {
		return retryAgentRun({ runId, requestId });
	}

	async getSession(conversationId: ConversationId) {
		return getSession(conversationId);
	}

	openEvents(input: Parameters<AgentRunTransport['openEvents']>[0]) {
		const source = new EventSource(
			`/api/agent/runs/${input.runId}/events?after=${encodeURIComponent(input.after)}`
		);
		source.onopen = input.onOpen;
		source.addEventListener('agent', (event) => {
			const parsed = JSON.parse(event.data) as Omit<AgentRunEventRecord, 'createdAt'> & {
				createdAt: string;
			};
			input.onEvent({ ...parsed, createdAt: new Date(parsed.createdAt) });
		});
		source.onerror = input.onError;
		return { close: () => source.close() };
	}
}
