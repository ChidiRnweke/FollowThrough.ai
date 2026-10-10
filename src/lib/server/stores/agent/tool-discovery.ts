/** Discovered tool names live for one MCP connection or agent execution. */
export class AgentToolDiscoveryStore {
	private readonly names: Set<string>;
	constructor(names: readonly string[] = []) {
		this.names = new Set(names);
	}
	has(name: string): boolean {
		return this.names.has(name);
	}
	add(names: readonly string[]): void {
		for (const name of names) this.names.add(name);
	}
}
