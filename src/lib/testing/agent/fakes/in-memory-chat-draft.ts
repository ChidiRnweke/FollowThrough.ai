import type {
	ChatDraftStorage,
	ChatSubmissionEnvironment
} from '$lib/controllers/agent/chat-composer';
import type { ChatHandoff } from '$lib/models/chat';
export class InMemoryChatDraft implements ChatDraftStorage {
	text = '';
	handoff: ChatHandoff | undefined;
	read(): string {
		return this.text;
	}
	save(text: string): void {
		this.text = text;
	}
	consumeHandoff(): ChatHandoff | undefined {
		const result = this.handoff;
		this.handoff = undefined;
		return result;
	}
}
export class InMemoryChatSubmissionEnvironment implements ChatSubmissionEnvironment {
	limited = false;
	atStreamLimit(): boolean {
		return this.limited;
	}
	takeCanvasRender(): undefined {
		return undefined;
	}
}
