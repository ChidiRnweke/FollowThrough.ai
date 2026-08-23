import type { AppSurfaceKind } from '$lib/models/workspace/app-context';
import type { RunAgentInput } from '$lib/models/agent';
import {
	agentRunIdInputSchema as runIdInput,
	submitAgentRunInputSchema as submitAgentRunSchema
} from '$lib/models/agent';

/**
 * The workspace and agent model domains repeat the surface vocabulary because
 * model domains do not import one another. This adapter sees both and makes a
 * drift between them a compile error at the protocol boundary.
 */
type AgentSurfaceKind = NonNullable<RunAgentInput['appContext']>['surface']['kind'];
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _surfacesAgree: Mutual<AppSurfaceKind, AgentSurfaceKind> = true;
void _surfacesAgree;

export { runIdInput, submitAgentRunSchema };
