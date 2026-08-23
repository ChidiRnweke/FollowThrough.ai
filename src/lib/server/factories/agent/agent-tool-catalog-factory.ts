import { TOOL_DESCRIPTIONS } from '$lib/models/agent/tool-catalog';
import type { ToolCatalog, ToolCatalogEntry } from '$lib/server/services/agent/tools/preferences';
import { LOCKED_TOOL_NAMES } from './agent-tool-factory';

/** Metadata has no actor or execution context; it is the canonical static tool catalog. */
export const describeAgentTools = (): readonly ToolCatalogEntry[] =>
	TOOL_DESCRIPTIONS.map((entry) => ({
		name: entry.name,
		description: entry.description,
		classification: entry.classification,
		locked: LOCKED_TOOL_NAMES.includes(entry.name)
	}));

export const agentToolCatalog: ToolCatalog = { entries: describeAgentTools };
