import type { ChatTranscript } from '$lib/services/chat/transcript';
import type { ChatToolActivity } from '$lib/models/chat';
import type { ChatEntry } from '$lib/models/chat';
import type { AgentPayload } from '$lib/models/agent/payload';
export interface ChatPresentationController {
	entryText(entry: ChatEntry): string;
	entryTools(entry: ChatEntry): ChatToolActivity[];
	toolOutput(tool: ChatToolActivity): AgentPayload | undefined;
	toolFailure(tool: ChatToolActivity): string | undefined;
}
export class ChatPresentation implements ChatPresentationController {
	constructor(private readonly tools: ChatTranscript) {}
	entryText(entry: ChatEntry): string {
		return this.tools.entryText(entry);
	}
	entryTools(entry: ChatEntry): ChatToolActivity[] {
		return this.tools.entryTools(entry);
	}
	toolOutput(tool: ChatToolActivity): AgentPayload | undefined {
		return this.tools.toolOutput(tool);
	}
	toolFailure(tool: ChatToolActivity): string | undefined {
		return this.tools.toolFailure(tool);
	}
}
