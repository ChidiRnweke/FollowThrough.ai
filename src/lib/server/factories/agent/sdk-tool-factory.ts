import type { SdkToolOptions } from '$lib/server/adapters/agent/sdk-tool';
import { ToolCallBoundary } from '$lib/server/adapters/agent/tool-call';
import { AgentToolCalls } from '$lib/server/controllers/agent/tool-calls';
import {
	AgentToolInvocation,
	type AgentToolInvocationControl
} from '$lib/server/controllers/agent/tool-invocation';
import { AgentToolInvocationStore } from '$lib/server/stores/agent/tool-invocation';
export const createSdkToolInvocation = (options: SdkToolOptions): AgentToolInvocationControl =>
	new AgentToolInvocation(
		new AgentToolInvocationStore(),
		new AgentToolCalls(new ToolCallBoundary()),
		options.prepare,
		options.signal
	);
