import type { AgentPayload, AgentPayloadObject } from '$lib/models/agent/payload';
import type { AgentToolName } from '$lib/models/agent/tool-catalog';
import type { ChatToolActivity, ChatToolActivityBase } from '$lib/stores/agent/chat-tools';

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

/**
 * A catalog tool row from a default and the spec's overrides. Each arm is built
 * whole, so the subject stays paired with the status that can carry it.
 */
export const chatToolActivity = (
	base: {
		readonly callId: string;
		readonly name: AgentToolName;
		readonly arguments: AgentPayloadObject;
	},
	over: ToolActivityOverrides
): ChatToolActivity => {
	const identity = {
		callId: over.callId ?? base.callId,
		arguments: over.arguments ?? base.arguments,
		...(over.runId === undefined ? {} : { runId: over.runId })
	};
	if (over.status === 'failed')
		return { ...identity, name: over.name ?? base.name, status: 'failed', failure: over.failure };
	const subject = { ...identity, source: 'catalog' as const, name: over.name ?? base.name };
	switch (over.status) {
		case 'running':
			return { ...subject, status: 'running' };
		case 'approval_required':
			return { ...subject, status: 'approval_required' };
		case 'rejected':
			return { ...subject, status: 'rejected' };
		case 'reported_failure':
			return { ...subject, status: 'reported_failure', failure: over.failure, output: over.output };
		case undefined:
		case 'succeeded':
			return {
				...subject,
				status: 'succeeded',
				...(over.output === undefined ? {} : { output: over.output })
			};
	}
};
