import type { ApiTokenScope } from '$lib/models/identity';
import type { ToolDescriptor } from '$lib/models/agent/tool-index';
import type { McpToolSessionControl } from './mcp-tools';

export interface McpToolStartupControl<Surface> {
	open(): Surface;
}
export interface McpToolConnection<Surface> {
	create(session: McpToolSessionControl): Surface;
}
/** Resolve authority before constructing the session and registering its protocol handlers. */
export class McpToolStartup<
	Definition extends ToolDescriptor,
	Surface
> implements McpToolStartupControl<Surface> {
	constructor(
		private readonly scope: ApiTokenScope,
		private readonly registry: { forScope(scope: ApiTokenScope): Definition[] },
		private readonly construct: (definitions: Definition[]) => {
			readonly protocol: McpToolConnection<Surface>;
			readonly session: McpToolSessionControl;
		}
	) {}
	open(): Surface {
		const definitions = this.registry.forScope(this.scope);
		const { protocol, session } = this.construct(definitions);
		return protocol.create(session);
	}
}
