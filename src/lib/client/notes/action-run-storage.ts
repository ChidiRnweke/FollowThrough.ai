import { storedNoteActionRunSchema, type StoredNoteActionRun } from '$lib/models/agent';

export interface NoteActionRunStorage {
	load(): readonly StoredNoteActionRun[];
	save(runs: readonly StoredNoteActionRun[]): void;
}

/** Browser storage boundary for the note actions a tab can reconnect to. */
export class SessionRunStorage implements NoteActionRunStorage {
	private readonly key: string;

	constructor(
		private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
		accountId: string
	) {
		this.key = `followthrough.notes.active-actions.${accountId}`;
	}

	load(): readonly StoredNoteActionRun[] {
		const stored = this.storage.getItem(this.key);
		return stored === null ? [] : storedNoteActionRunSchema.array().parse(JSON.parse(stored));
	}

	save(runs: readonly StoredNoteActionRun[]): void {
		if (runs.length === 0) this.storage.removeItem(this.key);
		else this.storage.setItem(this.key, JSON.stringify(runs));
	}
}
