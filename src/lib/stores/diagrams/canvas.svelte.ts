import type { DiagramId } from '$lib/models/diagrams';
import type { ChatSessionKey } from '$lib/stores/agent/chat.svelte';
import { entryTools } from '$lib/stores/agent/chat.svelte';
import { chatRegistry } from '$lib/stores/agent/registries/chat-registry.svelte';
import { canvasDiagramId } from '$lib/stores/diagrams/canvas-subject';
import { diagramTab, type TabId } from '$lib/stores/workbench/tab-ref';

/**
 * The diagram a conversation has on its canvas, and the tab that shows it.
 *
 * There is one answer now. This used to decide between a draft tab and a saved
 * diagram's tab, and getting that decision wrong is what let the agent report a
 * diagram changed while the user looked at the version before it. A diagram is a
 * row, a row has one tab, and there is nothing left to choose.
 */
export interface SessionCanvas {
	readonly diagramId: DiagramId;
	readonly tab: TabId;
}

export const canvasFor = (sessionKey: ChatSessionKey): SessionCanvas | undefined => {
	const chat = chatRegistry.peek(sessionKey);
	const diagramId = canvasDiagramId((chat?.entries ?? []).flatMap((entry) => entryTools(entry)));
	return diagramId ? { diagramId, tab: diagramTab(diagramId) } : undefined;
};

/**
 * The most recent diagram this conversation wrote, named by the call that wrote it.
 *
 * A diagram pane renders `getProjectDiagram`, a cached query that every *client*
 * write refreshes by pairing itself with `.updates(...)`. The agent writes
 * server-side inside a tool, so nothing invalidates that cache and the pane goes
 * on showing the source from before the change — the diagram moves in the
 * database and not on screen.
 *
 * Identified by `callId` rather than by the diagram: two edits to one diagram
 * share an id, so comparing ids would refresh the first and ignore every one after.
 */
export interface AppliedDiagramWrite {
	readonly callId: string;
	readonly diagramId: DiagramId;
}

const WRITING_TOOLS = new Set(['create_diagram', 'edit_diagram']);

export const latestDiagramWrite = (sessionKey: ChatSessionKey): AppliedDiagramWrite | undefined => {
	const chat = chatRegistry.peek(sessionKey);
	const tools = (chat?.entries ?? []).flatMap((entry) => entryTools(entry));
	for (let index = tools.length - 1; index >= 0; index -= 1) {
		const tool = tools[index]!;
		if (!WRITING_TOOLS.has(tool.name) || tool.status !== 'succeeded' || !tool.callId) continue;
		const diagramId = canvasDiagramId([tool]);
		if (diagramId) return { callId: tool.callId, diagramId };
	}
	return undefined;
};
