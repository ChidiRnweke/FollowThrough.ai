import type {
	AgentGrepResult,
	AgentLsResult,
	AgentSedRange,
	AgentSedResult
} from '$lib/models/agent-files';
import type { ToolResultReader } from '$lib/models/agent-tool-context';
import type { AgentToolInput } from '$lib/models/agent-tool-inputs';
import type { AgentPayload } from '$lib/models/agent/payload';
import { toolFailure } from '$lib/models/agent/tool-failure';
import type { ActorContext } from '$lib/models/identity';
import type { AgentToolPresentation } from '$lib/server/services/agent/runs/tool-views';
import type { AgentPayloadInspection } from '$lib/services/agent/payload';

import type { AgentFileReader } from '$lib/server/services/agent-files/virtual-files';

export interface AgentFilesController {
	ls(actor: ActorContext, path?: string): Promise<AgentLsResult>;
	grep(
		actor: ActorContext,
		input: {
			readonly pattern: string;
			readonly path: string;
			readonly fixed: boolean;
			readonly ignoreCase: boolean;
		}
	): Promise<AgentGrepResult>;
	sed(actor: ActorContext, path: string, range: AgentSedRange): Promise<AgentSedResult>;

	agentLs(actor: ActorContext, input: AgentToolInput<'ls'>): Promise<AgentPayload>;
	agentGrep(actor: ActorContext, input: AgentToolInput<'grep'>): Promise<AgentPayload>;
	agentSed(actor: ActorContext, input: AgentToolInput<'sed'>): Promise<AgentPayload>;
}

export interface AgentFilesDependencies {
	readonly toolPresentation: AgentToolPresentation;
	readonly toolPayloads: AgentPayloadInspection;
	readonly toolResults: ToolResultReader;

	readonly reader: AgentFileReader;
}

export class AgentFiles implements AgentFilesController {
	constructor(private readonly dependencies: AgentFilesDependencies) {}

	ls(actor: ActorContext, path?: string): Promise<AgentLsResult> {
		return this.dependencies.reader.ls(actor, path);
	}

	grep(
		actor: ActorContext,
		input: {
			readonly pattern: string;
			readonly path: string;
			readonly fixed: boolean;
			readonly ignoreCase: boolean;
		}
	): Promise<AgentGrepResult> {
		return this.dependencies.reader.grep(actor, input);
	}

	sed(actor: ActorContext, path: string, range: AgentSedRange): Promise<AgentSedResult> {
		return this.dependencies.reader.sed(actor, path, range);
	}

	async agentLs(actor: ActorContext, input: AgentToolInput<'ls'>): Promise<AgentPayload> {
		const result = await (async () => {
			return this.projectToolFile(await this.ls(actor, input.path));
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	async agentGrep(actor: ActorContext, input: AgentToolInput<'grep'>): Promise<AgentPayload> {
		const result = await (async () => {
			return this.projectToolFile(
				await this.grep(actor, {
					pattern: input.pattern,
					path: input.path,
					fixed: input.fixed ?? false,
					ignoreCase: input.ignoreCase ?? false
				})
			);
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	async agentSed(actor: ActorContext, input: AgentToolInput<'sed'>): Promise<AgentPayload> {
		const result = await (async () => {
			return this.projectToolFile(await this.sed(actor, input.path, input.range));
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}

	private projectToolFile(result: AgentLsResult | AgentGrepResult | AgentSedResult) {
		if (result.kind !== 'error') return result;
		return toolFailure(result.code, result.message, 'Follow the exact nextActions below.', {
			...('requestedPath' in result
				? { requestedPath: result.requestedPath }
				: { pattern: result.pattern }),
			...('lineCount' in result ? { lineCount: result.lineCount } : {}),
			nextActions: result.nextActions.map((action) => ({
				reason: action.reason,
				tool: action.tool,
				arguments: this.dependencies.toolResults.json(action.arguments)
			}))
		});
	}
}
