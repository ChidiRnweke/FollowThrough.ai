import type { AgentTool } from '$lib/models/agent-tool-protocol';

/** A built tool that runs its operation directly; a reviewed or missing tool fails the test. */
export const directTool = (
	tool: AgentTool | undefined
): Extract<AgentTool, { readonly kind: 'direct' }> => {
	if (!tool) throw new Error('The tool was not built');
	if (tool.kind !== 'direct')
		throw new Error(`${tool.name} is a reviewed tool; call it through its review`);
	return tool;
};
