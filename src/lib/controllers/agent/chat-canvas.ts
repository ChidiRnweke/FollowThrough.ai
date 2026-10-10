import type { DiagramId } from '$lib/models/diagrams';
import type { ChatSessionKey, ChatToolActivity } from '$lib/models/chat';
import type { ChatSessionsController } from './chat-sessions';
import type { ChatTranscript } from '$lib/services/chat/transcript';
import { diagramTab } from '$lib/stores/workbench/tab-ref';
export interface SessionCanvas {
	readonly diagramId: DiagramId;
	readonly tab: string;
}
export interface AppliedDiagramWrite {
	readonly callId: string;
	readonly diagramId: DiagramId;
}
export interface ChatCanvasReader {
	read(tool: ChatToolActivity): DiagramId | undefined;
}
export interface ChatCanvasController {
	canvasFor(key: ChatSessionKey): SessionCanvas | undefined;
	latestDiagramWrite(key: ChatSessionKey): AppliedDiagramWrite | undefined;
}
export class ChatCanvas implements ChatCanvasController {
	constructor(
		private readonly sessions: ChatSessionsController,
		private readonly presentation: ChatTranscript,
		private readonly reader: ChatCanvasReader
	) {}
	private tools(key: ChatSessionKey): ChatToolActivity[] {
		return (this.sessions.peek(key)?.entries ?? []).flatMap((entry) =>
			this.presentation.entryTools(entry)
		);
	}
	canvasFor(key: ChatSessionKey): SessionCanvas | undefined {
		const tools = this.tools(key);
		for (let index = tools.length - 1; index >= 0; index--) {
			const diagramId = this.reader.read(tools[index]!);
			if (diagramId) return { diagramId, tab: diagramTab(diagramId) };
		}
		return undefined;
	}
	latestDiagramWrite(key: ChatSessionKey): AppliedDiagramWrite | undefined {
		const tools = this.tools(key);
		for (let index = tools.length - 1; index >= 0; index--) {
			const tool = tools[index]!;
			if ((tool.name !== 'create_diagram' && tool.name !== 'edit_diagram') || !tool.callId)
				continue;
			const diagramId = this.reader.read(tool);
			if (diagramId) return { diagramId, callId: tool.callId };
		}
		return undefined;
	}
}
