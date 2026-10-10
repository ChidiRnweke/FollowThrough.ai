import type { AgentPayload } from '$lib/models/agent/payload';
import type { AgentToolName } from '$lib/models/agent/tool-catalog';
import type { ChatToolActivityBase } from '$lib/stores/agent/chat-tools';

/**
 * What a spec may override on a tool-activity fixture.
 *
 * The identity fields are free; the outcome is one arm, chosen whole. A plain
 * `Partial<ChatToolActivity>` cannot express that — partialling a union drops
 * the tie between `status` and its payload, which is how a fixture came to
 * assert a `failed` call carrying an `output` that production has no way to
 * produce. A fixture that can build an impossible state teaches it to everyone
 * who copies it.
 */
export type ToolActivityOverrides = Partial<
	Pick<ChatToolActivityBase, 'callId' | 'arguments' | 'runId'>
> &
	(
		| ({ readonly name?: AgentToolName } & (
				| { readonly status?: 'succeeded'; readonly output?: AgentPayload }
				| { readonly status: 'running' }
				| { readonly status: 'approval_required' }
				| { readonly status: 'rejected' }
				| {
						readonly status: 'reported_failure';
						readonly failure: string;
						readonly output: AgentPayload;
				  }
		  ))
		/** Only a failed call can name a tool the agent does not have: it never ran. */
		| { readonly name?: string; readonly status: 'failed'; readonly failure: string }
	);
