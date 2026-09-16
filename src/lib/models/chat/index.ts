import type { NoteId, TextSelection } from '$lib/models/notes';

export type ResourceChip =
	| { readonly kind: 'note' | 'skill'; readonly id: NoteId; readonly name: string }
	| {
			readonly kind: 'folder';
			readonly id: NoteId;
			readonly name: string;
			readonly noteCount: number;
	  };

export interface SelectionChip {
	readonly kind: 'selection';
	readonly id: string;
	readonly name: string;
	readonly wordCount: number;
	readonly selection: TextSelection;
}

export type ContextChip = ResourceChip | SelectionChip;
export interface MentionReference {
	readonly chip: ResourceChip;
	readonly from: number;
	readonly to: number;
}
export interface MentionDocument {
	readonly text: string;
	readonly references: readonly MentionReference[];
}
export interface MentionHistory {
	readonly past: readonly MentionDocument[];
	readonly present: MentionDocument;
	readonly future: readonly MentionDocument[];
}
export interface MentionEdit {
	readonly from: number;
	readonly to: number;
	readonly text: string;
}
export interface ComposerSelection {
	readonly from: number;
	readonly to: number;
}
export type MentionInput =
	{ readonly kind: 'edit'; readonly edit: MentionEdit } | { readonly kind: 'untracked' };

export const MENTION_PATTERN = /(^|\s)@([^\s@]*)$/;
