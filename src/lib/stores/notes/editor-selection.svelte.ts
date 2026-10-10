import type { TextSelection } from '$lib/models/notes';

export interface EditorSelectionState {
	readonly current: TextSelection | undefined;
	set(selection: TextSelection): void;
	clear(): void;
}
export class EditorSelectionStore implements EditorSelectionState {
	current = $state<TextSelection | undefined>(undefined);

	set(selection: TextSelection): void {
		this.current = selection;
	}
	clear(): void {
		this.current = undefined;
	}
}

export const editorSelection = new EditorSelectionStore();
