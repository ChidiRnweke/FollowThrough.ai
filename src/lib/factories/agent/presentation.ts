import {
	ChatPresentation,
	type ChatPresentationController
} from '$lib/controllers/agent/presentation';
import { ChatTranscriptService } from '$lib/services/chat/transcript';
export const chatPresentation: ChatPresentationController = new ChatPresentation(
	new ChatTranscriptService()
);
