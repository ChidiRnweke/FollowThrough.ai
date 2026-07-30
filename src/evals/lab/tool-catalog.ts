import { randomUUID } from 'node:crypto';
import type { ActorContext, ProvenanceId, RunAgentInput } from '$lib/models';
import { EmbeddedToolRetriever, type ToolDescriptor } from '$lib/server/services';
import { AgentTools } from '$lib/server/agent-tool-factory';
import type { Lab } from './application';

/**
 * Builds the production tool registry outside an agent run.
 *
 * This is what makes broad tool coverage affordable: `search_tools` ranking is a
 * property of the retriever plus the catalog's descriptions, not of the model,
 * so it can be asserted directly. One agent turn costs ~30s; ranking every tool
 * in the catalog costs a cached embedding lookup each.
 */
export function toolRegistry(lab: Lab, actor: ActorContext): AgentTools {
	const input: RunAgentInput = { prompt: '' };
	return new AgentTools(
		lab.controllers,
		actor,
		'auto_accept',
		{ provenanceId: randomUUID() as ProvenanceId, input, model: lab.model },
		undefined,
		new EmbeddedToolRetriever(lab.embeddingClient)
	);
}

/** The long-tail catalog: everything reachable only via `search_tools`. */
export const toolCatalog = (lab: Lab, actor: ActorContext): ToolDescriptor[] =>
	toolRegistry(lab, actor).catalog();

/**
 * Ranks the catalog for a goal, returning tool names best-first — the same call
 * `search_tools` makes on the agent's behalf.
 */
export async function rankToolsForGoal(
	lab: Lab,
	actor: ActorContext,
	goal: string,
	limit = 5
): Promise<readonly string[]> {
	const retriever = new EmbeddedToolRetriever(lab.embeddingClient);
	return retriever.retrieve(toolCatalog(lab, actor), goal, limit);
}
