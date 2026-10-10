import type { DiagramId } from '$lib/models/diagrams';
import {
	writtenDiagram,
	namedDiagram,
	acceptedDiagram,
	type ChatToolActivity
} from '$lib/models/chat';
import type { ChatCanvasReader } from '$lib/controllers/agent/chat-canvas';
export class BrowserChatCanvasReader implements ChatCanvasReader {
	read(tool: ChatToolActivity): DiagramId | undefined {
		if (tool.status !== 'succeeded') return undefined;
		if (tool.name === 'create_diagram' || tool.name === 'edit_diagram')
			return writtenDiagram.safeParse(tool.output).data?.diagramId;
		if (tool.name === 'read_project_diagram') return namedDiagram.safeParse(tool.output).data?.id;
		if (tool.name === 'accept_suggestion')
			return acceptedDiagram.safeParse(tool.output).data?.artifact.id;
		return undefined;
	}
}
