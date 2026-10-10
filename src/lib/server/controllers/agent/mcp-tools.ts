import type { AgentPayload } from '$lib/models/agent/payload';
import type { AgentToolCatalog } from '$lib/services/agent/tool-catalog';
import { toolFailure } from '$lib/models/agent/tool-failure';
import type { ToolDescriptor } from '$lib/models/agent/tool-index';
import type { AgentToolDiscoveryControl } from './tool-discovery';
import type { AgentToolCallControl, PreparedAction } from './tool-calls';

export interface McpToolResultReader {
	failed(value: AgentPayload): boolean;
}
export interface McpToolSessionControl {
	list(): readonly string[];
	search(query: string, limit: number): Promise<AgentPayload>;
	invoke(
		name: string,
		prepare: () => PreparedAction,
		signal: AbortSignal
	): Promise<{ readonly value: AgentPayload; readonly listChanged: boolean }>;
}

/** Dispatch and discovery share the same permitted catalog for one connection. */
export class McpToolSession implements McpToolSessionControl {
	constructor(
		private readonly catalog: readonly ToolDescriptor[],
		private readonly discovery: AgentToolDiscoveryControl,
		private readonly calls: AgentToolCallControl,
		private readonly reader: McpToolResultReader,
		private readonly catalogRules: Pick<AgentToolCatalog, 'isFirstClass'>
	) {}

	list(): readonly string[] {
		return this.catalog
			.filter(({ name }) => this.catalogRules.isFirstClass(name) || this.discovery.isEnabled(name))
			.map(({ name }) => name);
	}

	search(query: string, limit: number): Promise<AgentPayload> {
		return this.discovery.search(query, limit);
	}

	async invoke(
		name: string,
		prepare: () => PreparedAction,
		signal: AbortSignal
	): Promise<{ readonly value: AgentPayload; readonly listChanged: boolean }> {
		if (name !== 'search_tools' && !this.list().includes(name))
			return {
				value: toolFailure(
					'TOOL_NOT_AVAILABLE',
					`Tool "${name}" is not available.`,
					'Use search_tools to discover an available capability.'
				),
				listChanged: false
			};
		const prepared = await this.calls.prepare(
			async () => ({ kind: 'ready', action: prepare() }),
			signal
		);
		if (prepared.kind === 'failure') return { value: prepared.failure, listChanged: false };
		const value = await this.calls.execute(prepared.action, signal);
		return { value, listChanged: name === 'search_tools' && !this.reader.failed(value) };
	}
}
