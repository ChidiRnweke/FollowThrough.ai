import {
	agentResourcePathSchema,
	type AgentResourcePath,
	type AgentResourcePathReading
} from '$lib/models/agent-files';
export type { AgentFileRepository } from '$lib/models/agent-files';

/** Canonical resource decoding stays at the repository input boundary. */
export class AgentResourcePaths implements AgentResourcePathReading {
	read(path: string): AgentResourcePath | undefined {
		return agentResourcePathSchema.safeParse(path).data;
	}
}
