export interface AgentToolDiscoveryState {
	open(names: readonly string[]): number;
	has(session: number, name: string): boolean;
	add(session: number, names: readonly string[]): void;
}
/** Each SDK tool set and MCP connection has its own passive promotion set. */
export class AgentToolDiscoveryStore implements AgentToolDiscoveryState {
	private readonly sessions: Set<string>[] = [];
	open(names: readonly string[]): number {
		return this.sessions.push(new Set(names)) - 1;
	}
	has(session: number, name: string): boolean {
		return this.session(session).has(name);
	}
	add(session: number, names: readonly string[]): void {
		for (const name of names) this.session(session).add(name);
	}
	private session(id: number): Set<string> {
		const state = this.sessions[id];
		if (!state) throw new Error('Tool discovery session was not opened');
		return state;
	}
}
