import type { AgentExecutionMode, ToolClassification } from '$lib/models/agent';
import { toolFailure, type ToolFailure } from '$lib/models/agent/tool-failure';
import type { NoteChangeReview } from '$lib/models/notes';
export interface AgentToolApprovalPolicy {
	requirement(
		classification: ToolClassification,
		mode: AgentExecutionMode
	): 'approval_required' | 'ready';
	failure(review: Extract<NoteChangeReview, { kind: 'failure' }>): ToolFailure;
}
export class AgentToolApprovalRules implements AgentToolApprovalPolicy {
	requirement(
		classification: ToolClassification,
		mode: AgentExecutionMode
	): 'approval_required' | 'ready' {
		return classification === 'mutation' && mode === 'approval_required'
			? 'approval_required'
			: 'ready';
	}
	failure(review: Extract<NoteChangeReview, { kind: 'failure' }>): ToolFailure {
		return toolFailure(
			'NOTE_REVIEW_FAILED',
			'No changes were applied.',
			'Correct the problems below and submit a new tool call.',
			{ problems: [...review.problems] }
		);
	}
}
