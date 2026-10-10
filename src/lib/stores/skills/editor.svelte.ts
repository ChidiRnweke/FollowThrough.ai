import type { Note } from '$lib/models/notes';
export interface SkillEditorState {
	readonly note: Note;
	readonly savedDescription: string;
	readonly epoch: number;
	readonly importing: boolean;
	readonly exporting: boolean;
	readonly closed: boolean;
}
/** Mutable values belong to one mounted skill editor. */
export class SkillEditorStore {
	private current: SkillEditorState;
	private timer: (() => void) | undefined;
	constructor(note: Note, description: string) {
		this.current = $state({
			note,
			savedDescription: description,
			epoch: 0,
			importing: false,
			exporting: false,
			closed: false
		});
	}
	read(): SkillEditorState {
		return this.current;
	}
	update(patch: Partial<SkillEditorState>): void {
		this.current = { ...this.read(), ...patch };
	}
	get scheduled(): (() => void) | undefined {
		return this.timer;
	}
	setScheduled(timer: (() => void) | undefined): void {
		this.timer = timer;
	}
}
