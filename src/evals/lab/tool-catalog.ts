import type { ActorContext } from '$lib/models/identity';
import {
	EmbeddedToolRetriever,
	type ToolDescriptor
} from '$lib/server/services/agent/tools/tool-retriever';
import { TOOL_CATALOG } from '$lib/models/agent/tool-catalog';
import type { Lab } from './application';

/**
 * Reads the production discovery catalog without inventing an execution
 * context. Ranking metadata has no actor, provenance, model, or controllers.
 *
 * This is what makes broad tool coverage affordable: `search_tools` ranking is a
 * property of the retriever plus the catalog's descriptions, not of the model,
 * so it can be asserted directly. One agent turn costs ~30s; ranking every tool
 * in the catalog costs a cached embedding lookup each.
 */
/** The long-tail catalog: everything reachable only via `search_tools`. */
export const toolCatalog = (): ToolDescriptor[] => [...TOOL_CATALOG];

/**
 * Ranks the catalog for a goal, returning tool names best-first — the same call
 * `search_tools` makes on the agent's behalf.
 */
export async function rankToolsForGoal(
	lab: Lab,
	_actor: ActorContext,
	goal: string,
	limit = 5
): Promise<readonly string[]> {
	const retriever = new EmbeddedToolRetriever(lab.embeddingClient);
	return retriever.retrieve(toolCatalog(), goal, limit);
}
