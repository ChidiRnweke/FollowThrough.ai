import type { ActorContext } from '$lib/models/identity';
import type {
	AgentGrepResult,
	AgentLsResult,
	AgentSedRange,
	AgentSedResult
} from '$lib/models/agent-files';

export interface AgentFileReader {
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
}

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
}

export interface AgentFilesDependencies {
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
}
