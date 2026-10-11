import type { AgentExecutionMode } from '$lib/models/agent';
import type { NoteChangeRequest, NoteChangeReview } from '$lib/models/notes';

export type AgentNoteReviewPreparation =
	| {
			readonly kind: 'failure';
			readonly review: NoteChangeReview;
			readonly failure: import('$lib/models/agent/tool-failure').ToolFailure;
	  }
	| { readonly kind: 'ready' | 'approval_required'; readonly review: NoteChangeReview };
export interface AgentNoteReviewRequest {
	readonly request: NoteChangeRequest;
	readonly target: import('$lib/models/notes').NoteChangeTarget;
	readonly mode: AgentExecutionMode;
	readonly phase: 'approval' | 'execute';
	readonly saved?: NoteChangeReview;
}

/** Protocol routes for tools that carry a serialized note review through approval. */
export const reviewedNoteTools: readonly {
	readonly name: string;
	readonly target: import('$lib/models/notes').NoteChangeTarget;
	readonly kind: 'patch' | 'replace';
}[] = [
	{ name: 'save_note', target: 'authored', kind: 'replace' },
	{ name: 'edit_note', target: 'authored', kind: 'patch' },
	{ name: 'save_skill', target: 'skill', kind: 'replace' },
	{ name: 'edit_skill', target: 'skill', kind: 'patch' }
];
