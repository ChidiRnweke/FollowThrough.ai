import { ToolLifecycleError } from '$lib/errors';
import type {
	AgentExecutionMode,
	PendingAgentDecision,
	ToolClassification
} from '$lib/models/agent';
import type { AgentPayloadObject } from '$lib/models/agent/payload';
import { toolFailure, type ToolFailure } from '$lib/models/agent/tool-failure';
import type { ActorContext } from '$lib/models/identity';
import type { NoteChangeRequest, NoteChangeReview, NoteChangeTarget } from '$lib/models/notes';
import type { NotesController } from '$lib/server/controllers/notes/controller';
import type { AgentToolPresentation } from '$lib/server/services/agent/runs/tool-views';
import type { AgentToolReviewStore } from '$lib/server/stores/agent/tool-reviews';
import type { PreparedAction, ToolPreparation } from './tool-calls';

type NoteToolReceipt = {
	readonly noteId: string;
	readonly title: string;
	readonly currentRevision: number;
};
export type NoteToolChangeResult =
	| ToolFailure
	| NoteToolReceipt
	| (NoteToolReceipt & { readonly appliedEdits: number; readonly matchedTexts: string[] });

export interface ToolReviewReader {
	review(content: string): NoteChangeReview;
	request(args: AgentPayloadObject, kind: 'replace' | 'patch'): NoteChangeRequest;
}
export interface AgentToolReviewControl {
	restore(pending: readonly PendingAgentDecision[]): void;
	checkpoint(pending: PendingAgentDecision): PendingAgentDecision;
	prepare(
		name: string,
		classification: ToolClassification,
		mode: AgentExecutionMode,
		action: PreparedAction,
		callId: string | undefined,
		phase: 'approval' | 'execute'
	): Promise<ToolPreparation>;
	change(input: NoteChangeRequest, target: NoteChangeTarget): Promise<NoteToolChangeResult>;
}

export class AgentToolReviews implements AgentToolReviewControl {
	constructor(
		private readonly notes: () => Pick<NotesController, 'prepareChange' | 'applyReviewedChange'>,
		private readonly actor: ActorContext,
		private readonly state: AgentToolReviewStore,
		private readonly reader: ToolReviewReader,
		private readonly presentation: Pick<AgentToolPresentation, 'projectNoteWrite'>
	) {}

	restore(pending: readonly PendingAgentDecision[]): void {
		for (const decision of pending) {
			if (!this.isReviewedNoteTool(decision.toolName)) continue;
			if (!decision.review)
				throw new ToolLifecycleError('A saved note approval is missing its prepared review');
			this.state.save(decision.callId, this.reader.review(decision.review.content));
		}
	}

	checkpoint(pending: PendingAgentDecision): PendingAgentDecision {
		if (!this.isReviewedNoteTool(pending.toolName)) return pending;
		const review = this.state.get(pending.callId);
		if (!review) throw new Error('A note approval has no prepared review');
		return { ...pending, review: { kind: 'note_change', content: JSON.stringify(review) } };
	}

	async prepare(
		name: string,
		classification: ToolClassification,
		mode: AgentExecutionMode,
		action: PreparedAction,
		callId: string | undefined,
		phase: 'approval' | 'execute'
	): Promise<ToolPreparation> {
		let prepared = action;
		if (this.isReviewedNoteTool(name)) {
			if (!callId) throw new ToolLifecycleError('A note change requires a tool call identity');
			const saved = this.state.get(callId);
			if (!saved && phase === 'execute' && mode === 'approval_required')
				throw new ToolLifecycleError('A resumed note approval is missing its prepared review');
			const target = name.endsWith('_skill') ? 'skill' : 'authored';
			const review =
				saved ??
				(await this.notes().prepareChange(
					this.actor,
					this.reader.request(
						action.arguments,
						name === 'save_note' || name === 'save_skill' ? 'replace' : 'patch'
					),
					target
				));
			this.state.save(callId, review);
			if (review.kind === 'failure')
				return { kind: 'failure', failure: this.reviewFailure(review) };
			prepared = { arguments: action.arguments, execute: () => this.apply(review, target) };
		}
		return {
			kind:
				classification === 'mutation' && mode === 'approval_required'
					? 'approval_required'
					: 'ready',
			action: prepared
		};
	}

	async change(input: NoteChangeRequest, target: NoteChangeTarget): Promise<NoteToolChangeResult> {
		return this.apply(await this.notes().prepareChange(this.actor, input, target), target);
	}

	private async apply(
		review: NoteChangeReview,
		target: NoteChangeTarget
	): Promise<NoteToolChangeResult> {
		if (review.kind === 'failure') return this.reviewFailure(review);
		const result = await this.notes().applyReviewedChange(this.actor, review.change, target);
		if (result.kind === 'failure')
			return toolFailure(
				result.code,
				result.message,
				'Read the note and submit a new tool call for review.'
			);
		const projection = this.presentation.projectNoteWrite(result.note);
		return review.change.operation.kind === 'patch'
			? {
					...projection,
					appliedEdits: review.change.operation.appliedEdits,
					matchedTexts: [...review.change.operation.matchedTexts]
				}
			: { ...projection };
	}

	private reviewFailure(review: Extract<NoteChangeReview, { kind: 'failure' }>) {
		return toolFailure(
			'NOTE_REVIEW_FAILED',
			'No changes were applied.',
			'Correct the problems below and submit a new tool call.',
			{ problems: [...review.problems] }
		);
	}
	private isReviewedNoteTool(name: string): boolean {
		return (
			name === 'save_note' || name === 'edit_note' || name === 'save_skill' || name === 'edit_skill'
		);
	}
}
