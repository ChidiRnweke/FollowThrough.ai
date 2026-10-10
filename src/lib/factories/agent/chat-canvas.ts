import { ChatCanvas, type ChatCanvasController } from '$lib/controllers/agent/chat-canvas';
import { BrowserChatCanvasReader } from '$lib/client/agent/chat-canvas-reader';
import { ChatTranscriptService } from '$lib/services/chat/transcript';
import { chatRegistry } from './chat';
export const chatCanvas: ChatCanvasController = new ChatCanvas(
	chatRegistry,
	new ChatTranscriptService(),
	new BrowserChatCanvasReader()
);
