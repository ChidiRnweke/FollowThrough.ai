import type { TextSelection } from '$lib/models/notes';

export class EditorSelectionStore {
	current = $state<TextSelection | undefined>(undefined);

	set(selection: TextSelection): void {
		this.current = selection;
	}
	clear(): void {
		this.current = undefined;
	}
}

export const editorSelection = new EditorSelectionStore();
