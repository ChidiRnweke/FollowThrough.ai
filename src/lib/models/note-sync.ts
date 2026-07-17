import type { Note } from './domain';
import type { DateTime, NoteEtag, NoteId, ProjectId, UserId } from './shared';

export interface VersionedNote {
	readonly note: Note;
	readonly etag: NoteEtag;
}

export interface SyncNoteInput {
	readonly note: Note;
	readonly baseEtag: NoteEtag;
	readonly operationId: string;
}

export type SyncNoteOutput =
	| {
			readonly outcome: 'saved';
			readonly version: VersionedNote;
			readonly repairedAnchorIds: readonly import('./shared').SourceAnchorId[];
	  }
	| {
			readonly outcome: 'conflict';
			readonly baseEtag: NoteEtag;
			readonly remote: VersionedNote;
	  };

export interface NoteSyncInventoryEntry {
	readonly noteId: NoteId;
	readonly projectId: ProjectId;
	readonly etag: NoteEtag;
	readonly updatedAt: DateTime;
}

export interface ListNoteSyncInventoryInput {
	readonly projectId?: ProjectId;
}

export interface ListNoteSyncInventoryOutput {
	readonly entries: readonly NoteSyncInventoryEntry[];
}

export type NoteSyncRecordState = 'synced' | 'pending' | 'syncing' | 'conflict';

export interface NoteSyncRecord {
	readonly userId: UserId;
	readonly noteId: NoteId;
	readonly base: VersionedNote;
	readonly local: Note;
	readonly remote?: VersionedNote;
	readonly operationId: string;
	readonly editVersion: number;
	readonly state: NoteSyncRecordState;
	readonly updatedAt: DateTime;
}

export type NoteSyncStatus = 'loading' | 'synced' | 'saving' | 'pending' | 'conflict' | 'error';

export const noteEtag = (note: Pick<Note, 'id' | 'currentRevision'>): NoteEtag =>
	`note:${note.id}:r${note.currentRevision}` as NoteEtag;

export const noteMatchesEtag = (
	note: Pick<Note, 'id' | 'currentRevision'>,
	etag: NoteEtag
): boolean => noteEtag(note) === etag;

export const noteSyncContentEquals = (left: Note, right: Note): boolean =>
	left.title === right.title &&
	left.plainText === right.plainText &&
	left.isPinned === right.isPinned &&
	JSON.stringify(left.document) === JSON.stringify(right.document);
