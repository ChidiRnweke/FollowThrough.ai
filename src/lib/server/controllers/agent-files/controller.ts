import type {
	AgentGrepResult,
	AgentLsResult,
	AgentSedRange,
	AgentSedResult
} from '$lib/models/agent-files';

import type { AgentFileReader } from '$lib/server/services/agent-files/virtual-files';

export interface AgentFilesController {
	ls(path?: string): Promise<AgentLsResult>;
	grep(input: {
		readonly pattern: string;
		readonly path: string;
		readonly fixed: boolean;
		readonly ignoreCase: boolean;
	}): Promise<AgentGrepResult>;
	sed(path: string, range: AgentSedRange): Promise<AgentSedResult>;
}

export interface AgentFilesDependencies {
	readonly reader: AgentFileReader;
}

export class AgentFiles implements AgentFilesController {
	constructor(private readonly dependencies: AgentFilesDependencies) {}

	ls(path?: string): Promise<AgentLsResult> {
		return this.dependencies.reader.ls(path);
	}

	grep(input: {
		readonly pattern: string;
		readonly path: string;
		readonly fixed: boolean;
		readonly ignoreCase: boolean;
	}): Promise<AgentGrepResult> {
		return this.dependencies.reader.grep(input);
	}

	sed(path: string, range: AgentSedRange): Promise<AgentSedResult> {
		return this.dependencies.reader.sed(path, range);
	}
}
