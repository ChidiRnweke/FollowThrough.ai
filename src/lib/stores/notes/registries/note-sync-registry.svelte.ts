import type { NoteId } from '$lib/models/notes';
import { Registry } from './registry';
import { NoteSyncStore } from '../note-sync.svelte';

/**
 * Per-note registry of `NoteSyncStore` instances.  The IndexedDB layer that
 * backs each store is already keyed by `(userId, noteId)`, so closing a tab
 * (and therefore destroying the in-memory store) is cheap to rehydrate when
 * the note is reopened.
 */
export const noteSyncRegistry = new Registry<NoteId, NoteSyncStore>(
	() => new NoteSyncStore(),
	(_noteId, store) => store.reset()
);
