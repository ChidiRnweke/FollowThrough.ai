import type { ChatHandoff } from '$lib/models/chat';
export class ChatComposerState {
	handoff = $state<ChatHandoff | undefined>(undefined);
}
