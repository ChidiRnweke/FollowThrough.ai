import type { DateTime } from '$lib/models/workspace';
import type { NoteId, TrashedNote } from '$lib/models/notes';
import type { Diagram, DiagramId } from '$lib/models/diagrams';
import type { Component } from 'svelte';
import { FtDocument, FtFolder, FtSkills, FtWorkflow } from '$lib/components/icons';

/** The shape every `Ft*` icon has, matching `EmptyState` and `ActionProgress`. */
type TrashEntryIcon = Component<{ class?: string }>;

/**
 * One thing in the trash, whatever kind of thing it is.
 *
 * The trash is the one screen where a note, a folder and a diagram sit in a
 * single list, so a row has to say what it is before it says anything else. The
 * kind is a discriminant rather than a label because the id type follows from
 * it — a note is restored by `NoteId`, a diagram by `DiagramId`, and a list that
 * blurred the two would hand the wrong id to the wrong command.
 */
export type TrashEntry =
	| {
			readonly kind: 'note' | 'folder' | 'skill';
			readonly id: NoteId;
			readonly title: string;
			readonly projectName: string;
			readonly archivedAt: DateTime;
	  }
	| {
			readonly kind: 'diagram';
			readonly id: DiagramId;
			readonly title: string;
			readonly projectName: string;
			readonly archivedAt: DateTime;
	  };

/**
 * The icons the rest of the app already uses for these things.
 *
 * Deliberately not a new set. A diagram is `FtWorkflow` in the gallery, the
 * project overview, the note editor and the chat's tool rows; a folder is
 * `FtFolder` and a note `FtDocument` in the project tree. The trash mixes kinds
 * that are told apart nowhere else, so inventing icons here would be the one
 * screen where the vocabulary disagrees with itself.
 */
const TRASH_ENTRY_ICONS: Readonly<Record<TrashEntry['kind'], TrashEntryIcon>> = {
	note: FtDocument,
	folder: FtFolder,
	skill: FtSkills,
	diagram: FtWorkflow
};

export const trashEntryIcon = (entry: TrashEntry): TrashEntryIcon => TRASH_ENTRY_ICONS[entry.kind];

const TRASH_ENTRY_LABELS: Readonly<Record<TrashEntry['kind'], string>> = {
	note: 'Note',
	folder: 'Folder',
	skill: 'Skill',
	diagram: 'Diagram'
};

export const trashEntryLabel = (entry: TrashEntry): string => TRASH_ENTRY_LABELS[entry.kind];

/** Distinguishes rows across kinds, since a note and a diagram could share a uuid. */
export const trashEntryKey = (entry: TrashEntry): string => `${entry.kind}:${entry.id}`;

export const noteTrashEntry = (note: TrashedNote): TrashEntry => ({
	kind: note.kind,
	id: note.id,
	title: note.title,
	projectName: note.projectName,
	archivedAt: note.archivedAt
});

export const diagramTrashEntry = (diagram: Diagram, projectName: string): TrashEntry => ({
	kind: 'diagram',
	id: diagram.id,
	title: diagram.title ?? 'Untitled diagram',
	projectName,
	// Only an archived diagram reaches this list, so `archivedAt` is there. The
	// row is built from what the trash query returned, not from any diagram.
	archivedAt: diagram.archivedAt ?? diagram.updatedAt
});
