import {
	TOOL_DESCRIPTIONS,
	FIRST_CLASS_TOOL_NAMES,
	LOCKED_TOOL_NAMES,
	type ToolName,
	type ResolvedToolCatalogEntry,
	type ToolCatalogEntry
} from '../../models/agent/tool-catalog.ts';

export interface AgentToolCatalog {
	description(name: string): string;
	discoverable(): readonly (ToolCatalogEntry & { readonly name: ToolName })[];
	entries(): readonly ResolvedToolCatalogEntry[];
	isFirstClass(name: string): boolean;
	isLocked(name: string): boolean;
}

/** Static tool metadata and the direct/discoverable and locked partitions. */
export class AgentToolCatalogService implements AgentToolCatalog {
	description(name: string): string {
		const entry = TOOL_DESCRIPTIONS.find((candidate) => candidate.name === name);
		if (!entry) throw new Error(`Tool description missing from catalog: ${name}`);
		return entry.description;
	}
	discoverable(): readonly (ToolCatalogEntry & { readonly name: ToolName })[] {
		return TOOL_DESCRIPTIONS.filter((entry) => !this.isFirstClass(entry.name));
	}
	entries(): readonly ResolvedToolCatalogEntry[] {
		return TOOL_DESCRIPTIONS.map((entry) => ({
			name: entry.name,
			description: entry.description,
			classification: entry.classification,
			locked: this.isLocked(entry.name)
		}));
	}
	isFirstClass(name: string): boolean {
		return FIRST_CLASS_TOOL_NAMES.some((first) => first === name);
	}
	isLocked(name: string): boolean {
		return LOCKED_TOOL_NAMES.some((locked) => locked === name);
	}
}
