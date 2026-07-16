export type ChatToolStatus = 'running' | 'approval_required' | 'succeeded' | 'failed' | 'rejected';

export interface ChatToolActivity {
	callId: string;
	name: string;
	arguments: Readonly<Record<string, unknown>>;
	runId?: string;
	output?: unknown;
	failure?: string;
	status: ChatToolStatus;
}

const activeTools = (tools: ChatToolActivity[]): ChatToolActivity[] =>
	tools.filter((tool) => tool.status === 'running' || tool.status === 'approval_required');

const fallbackTool = (
	tools: ChatToolActivity[],
	incoming: ChatToolActivity
): ChatToolActivity | undefined => {
	if (incoming.status === 'running') return undefined;
	const active = activeTools(tools);
	const matchingName = active.filter(
		(tool) => incoming.name === 'tool' || tool.name === incoming.name
	);
	if (matchingName.length > 0) return matchingName.at(-1);
	return active.length === 1 ? active[0] : undefined;
};

/**
 * Merge lifecycle events so one tool call always occupies one row in the chat.
 * Returns the merged activity, or undefined when no existing activity matches —
 * the caller decides where a new activity is inserted.
 */
export const reconcileToolActivity = (
	tools: ChatToolActivity[],
	incoming: ChatToolActivity
): ChatToolActivity | undefined => {
	const exact = incoming.callId ? tools.find((tool) => tool.callId === incoming.callId) : undefined;
	const existing = exact ?? fallbackTool(tools, incoming);
	if (!existing) return undefined;

	if (incoming.callId) existing.callId = incoming.callId;
	if (incoming.name !== 'tool') existing.name = incoming.name;
	if (Object.keys(incoming.arguments).length > 0) existing.arguments = incoming.arguments;
	existing.status = incoming.status;
	if ('runId' in incoming) existing.runId = incoming.runId;
	if ('output' in incoming) existing.output = incoming.output;
	if ('failure' in incoming) existing.failure = incoming.failure;
	return existing;
};
