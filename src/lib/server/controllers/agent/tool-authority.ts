import { FIRST_CLASS_TOOL_NAMES } from '$lib/models/agent/tool-catalog';
import type { ApiTokenScope } from '$lib/models/identity';
import type { ToolClassification } from '$lib/models/agent';
import type { ToolName } from '$lib/models/agent/tool-catalog';
import type { ToolDescriptor } from '$lib/models/agent/tool-index';
import type { AgentToolCatalog } from '$lib/services/agent/tool-catalog';
import type { ToolAccessPolicy } from './tool-context';
interface ClassifiedTool {
	readonly name: ToolName;
	readonly classification: ToolClassification;
}
export interface AgentToolAuthority {
	selectMcp<T extends ClassifiedTool>(definitions: readonly T[], scope: ApiTokenScope): T[];
	select<T extends ClassifiedTool>(
		definitions: readonly T[],
		classifications?: readonly ToolClassification[]
	): T[];
	initial<T extends ClassifiedTool>(definitions: readonly T[]): T[];
	discoverable<T extends ClassifiedTool>(definitions: readonly T[]): T[];
	offered(definitions: readonly ClassifiedTool[], promoted: readonly string[]): ToolName[];
	catalog(): ToolDescriptor[];
}
export class AgentToolAuthorities implements AgentToolAuthority {
	constructor(
		private readonly rules: AgentToolCatalog,
		private readonly access: ToolAccessPolicy
	) {}
	select<T extends ClassifiedTool>(
		definitions: readonly T[],
		classifications?: readonly ToolClassification[]
	): T[] {
		return definitions.filter(
			(definition) =>
				(!classifications || classifications.includes(definition.classification)) &&
				(this.rules.isLocked(definition.name) || this.access.isEnabled(definition.name))
		);
	}
	selectMcp<T extends ClassifiedTool>(definitions: readonly T[], scope: ApiTokenScope): T[] {
		return this.select(definitions, scope === 'read' ? ['read'] : undefined);
	}

	initial<T extends ClassifiedTool>(definitions: readonly T[]): T[] {
		const byName = new Map(definitions.map((definition) => [definition.name, definition]));
		return FIRST_CLASS_TOOL_NAMES.map((name) => byName.get(name)).filter(
			(definition): definition is T => definition !== undefined
		);
	}
	discoverable<T extends ClassifiedTool>(definitions: readonly T[]): T[] {
		return definitions.filter((definition) => !this.rules.isFirstClass(definition.name));
	}
	offered(definitions: readonly ClassifiedTool[], promoted: readonly string[]): ToolName[] {
		return definitions
			.filter(
				(definition) =>
					this.rules.isFirstClass(definition.name) || promoted.includes(definition.name)
			)
			.map((definition) => definition.name);
	}
	catalog(): ToolDescriptor[] {
		return this.rules
			.discoverable()
			.filter((entry) => this.rules.isLocked(entry.name) || this.access.isEnabled(entry.name));
	}
}
