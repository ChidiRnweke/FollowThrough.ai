import type { AgentPayload } from '$lib/models/agent/payload';
import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';

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
	Pick<ChatToolActivity, 'callId' | 'name' | 'arguments' | 'runId'>
> &
	(
		| { readonly status?: 'succeeded'; readonly output?: AgentPayload }
		| { readonly status: 'running' }
		| { readonly status: 'approval_required' }
		| { readonly status: 'rejected' }
		| { readonly status: 'failed'; readonly failure: string }
	);
