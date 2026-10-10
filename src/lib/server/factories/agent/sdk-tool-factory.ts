import type { Tool } from '@openai/agents';
import { AgentSdkToolAdapter, type SdkToolOptions } from '$lib/server/adapters/agent/sdk-tool';
import { ToolCallBoundary } from '$lib/server/adapters/agent/tool-call';
import { AgentToolCalls } from '$lib/server/controllers/agent/tool-calls';
import { AgentToolInvocation } from '$lib/server/controllers/agent/tool-invocation';
import { AgentToolInvocationStore } from '$lib/server/stores/agent/tool-invocation';
export const createSdkTool = (options: SdkToolOptions): Tool<unknown> =>
	new AgentSdkToolAdapter().create(
		options,
		new AgentToolInvocation(
			new AgentToolInvocationStore(),
			new AgentToolCalls(new ToolCallBoundary()),
			options.prepare,
			options.signal
		)
	);
