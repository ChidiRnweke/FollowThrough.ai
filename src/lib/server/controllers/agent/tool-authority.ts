import type { AgentToolApprovalPolicy } from '$lib/services/agent/tool-approval';
import type { AgentExecutionMode } from '$lib/models/agent';
import { InvalidGeneratedContentError } from '$lib/errors';
import type { ToolClassification } from '$lib/models/agent';
import type { ClassifiedTool, ToolDiscoveryPlan } from '$lib/models/agent-tool-authority';
import type { ToolAccessPolicy } from '$lib/models/agent-tool-context';
import { FIRST_CLASS_TOOL_NAMES, type ToolName } from '$lib/models/agent/tool-catalog';
import { toolFailure, type ToolFailure } from '$lib/models/agent/tool-failure';
import type { ToolDescriptor } from '$lib/models/agent/tool-index';
import type { ApiTokenScope } from '$lib/models/identity';
import type { IToolCatalogIndex } from '$lib/server/services/agent/tools/tool-index';
import type { IEmbeddings } from '$lib/server/services/knowledge-search/embeddings';
import type { AgentToolDiscoveryState } from '$lib/server/stores/agent/tool-discovery';
import type { AgentToolCatalog } from '$lib/services/agent/tool-catalog';
export interface AgentToolAuthority {
	approvalRequired(mode: AgentExecutionMode): readonly ToolName[];
	select(
		definitions: readonly ClassifiedTool[],
		classifications?: readonly ToolClassification[]
	): ToolName[];
	appPlan(definitions: readonly ClassifiedTool[], promoted: readonly string[]): ToolDiscoveryPlan;
	mcpPlan(
		definitions: readonly (ToolDescriptor & ClassifiedTool)[],
		scope: ApiTokenScope
	): ToolDiscoveryPlan;
	offered(definitions: readonly ClassifiedTool[], promoted: readonly string[]): ToolName[];
	available(plan: ToolDiscoveryPlan): readonly ToolName[];
	authorize(plan: ToolDiscoveryPlan, name: string): ToolFailure | undefined;
	isEnabled(session: number, name: string): boolean;
	discover(plan: ToolDiscoveryPlan, query: string, limit: number): Promise<readonly string[]>;
	catalog(): ToolDescriptor[];
}
/** Complete authority/discovery operations return names and metadata, never executable definitions. */
export class AgentToolAuthorities implements AgentToolAuthority {
	constructor(
		private readonly rules: AgentToolCatalog,
		private readonly access: ToolAccessPolicy,
		private readonly index: Pick<IToolCatalogIndex, 'rank'>,
		private readonly embeddings: Pick<IEmbeddings, 'embed'>,
		private readonly state: AgentToolDiscoveryState,
		private readonly approval: AgentToolApprovalPolicy
	) {}
	approvalRequired(mode: AgentExecutionMode): readonly ToolName[] {
		return this.rules
			.entries()
			.filter(
				(entry) => this.approval.requirement(entry.classification, mode) === 'approval_required'
			)
			.map((entry) => entry.name);
	}

	select(
		definitions: readonly ClassifiedTool[],
		classifications?: readonly ToolClassification[]
	): ToolName[] {
		return definitions
			.filter(
				(definition) =>
					(!classifications || classifications.includes(definition.classification)) &&
					(this.rules.isLocked(definition.name) || this.access.isEnabled(definition.name))
			)
			.map((definition) => definition.name);
	}
	appPlan(definitions: readonly ClassifiedTool[], promoted: readonly string[]): ToolDiscoveryPlan {
		return this.plan(this.select(definitions), this.catalog(), promoted);
	}
	mcpPlan(
		definitions: readonly (ToolDescriptor & ClassifiedTool)[],
		scope: ApiTokenScope
	): ToolDiscoveryPlan {
		const permitted = this.select(definitions, scope === 'read' ? ['read'] : undefined);
		return this.plan(
			permitted,
			definitions.filter((entry) => permitted.includes(entry.name)),
			[]
		);
	}
	private plan(
		permitted: readonly ToolName[],
		catalog: readonly ToolDescriptor[],
		promoted: readonly string[]
	): ToolDiscoveryPlan {
		return {
			session: this.state.open(promoted),
			permitted,
			initial: FIRST_CLASS_TOOL_NAMES.filter((name) => permitted.includes(name)),
			discoverable: permitted.filter((name) => !this.rules.isFirstClass(name)),
			catalog
		};
	}
	offered(definitions: readonly ClassifiedTool[], promoted: readonly string[]): ToolName[] {
		return this.select(definitions).filter(
			(name) => this.rules.isFirstClass(name) || promoted.includes(name)
		);
	}
	available(plan: ToolDiscoveryPlan): readonly ToolName[] {
		return plan.permitted.filter(
			(name) => this.rules.isFirstClass(name) || this.state.has(plan.session, name)
		);
	}
	authorize(plan: ToolDiscoveryPlan, name: string): ToolFailure | undefined {
		if (name === 'search_tools' || this.available(plan).some((permitted) => permitted === name))
			return undefined;
		return toolFailure(
			'TOOL_NOT_AVAILABLE',
			`Tool "${name}" is not available.`,
			'Use search_tools to discover an available capability.'
		);
	}
	isEnabled(session: number, name: string): boolean {
		return this.state.has(session, name);
	}
	catalog(): ToolDescriptor[] {
		return this.rules
			.discoverable()
			.filter((entry) => this.rules.isLocked(entry.name) || this.access.isEnabled(entry.name));
	}
	async discover(
		plan: ToolDiscoveryPlan,
		query: string,
		limit: number
	): Promise<readonly string[]> {
		const candidates = plan.catalog.filter((entry) => !this.rules.isFirstClass(entry.name));
		if (!candidates.length) return [];
		const batch = await this.embeddings.embed([query]);
		const vector = batch.vectors[0];
		if (batch.vectors.length !== 1 || !vector)
			throw new InvalidGeneratedContentError('Tool search requires one query embedding');
		const ranked = await this.index.rank(
			candidates.map((entry) => entry.name),
			vector,
			batch.model,
			limit
		);
		const allowed = new Set<string>(plan.permitted);
		const matches = ranked.filter((name) => allowed.has(name));
		this.state.add(plan.session, matches);
		return matches;
	}
}
