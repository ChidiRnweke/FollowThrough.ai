import { ToolLifecycleError } from '$lib/errors';
import type { AgentExecutionMode, PendingAgentDecision } from '$lib/models/agent';
import type { PreparedAction, ToolPreparation } from '$lib/models/agent-tool-protocol';
import type { ActorContext } from '$lib/models/identity';
import type { NotesController } from '$lib/server/controllers/notes/controller';
import { reviewedNoteTools, type ToolReviewState } from '$lib/models/agent-tool-reviews';

import type { AgentToolReviewControl, ToolReviewReader } from '$lib/models/agent-tool-reviews';
export class AgentToolReviews implements AgentToolReviewControl {
	constructor(
		private readonly notes: () => Pick<
			NotesController,
			'prepareAgentReviewedChange' | 'applyAgentReviewedChange'
		>,
		private readonly actor: ActorContext,
		private readonly state: ToolReviewState,
		private readonly reader: ToolReviewReader
	) {}

	restore(pending: readonly PendingAgentDecision[]): void {
		for (const decision of pending) {
			if (!reviewedNoteTools.find((tool) => tool.name === decision.toolName)) continue;
			if (!decision.review)
				throw new ToolLifecycleError('A saved note approval is missing its prepared review');
			this.state.save(decision.callId, this.reader.review(decision.review.content));
		}
	}

	checkpoint(pending: PendingAgentDecision): PendingAgentDecision {
		if (!reviewedNoteTools.find((tool) => tool.name === pending.toolName)) return pending;
		const review = this.state.get(pending.callId);
		if (!review) throw new Error('A note approval has no prepared review');
		return { ...pending, review: { kind: 'note_change', content: JSON.stringify(review) } };
	}

	async prepare(
		name: string,
		requirement: 'ready' | 'approval_required',
		mode: AgentExecutionMode,
		action: PreparedAction,
		callId: string | undefined,
		phase: 'approval' | 'execute'
	): Promise<ToolPreparation> {
		const request = reviewedNoteTools.find((tool) => tool.name === name);
		if (!request) return { kind: requirement, action };
		if (!callId) throw new ToolLifecycleError('A note change requires a tool call identity');
		const prepared = await this.notes().prepareAgentReviewedChange(this.actor, {
			request: this.reader.request(action.arguments, request.kind),
			target: request.target,
			mode,
			phase,
			saved: this.state.get(callId)
		});
		this.state.save(callId, prepared.review);
		if (prepared.kind === 'failure') return { kind: 'failure', failure: prepared.failure };
		return {
			kind: prepared.kind,
			action: {
				arguments: action.arguments,
				execute: () =>
					this.notes().applyAgentReviewedChange(this.actor, prepared.review, request.target)
			}
		};
	}
}
