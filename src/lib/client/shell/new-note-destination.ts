import type { ProjectId } from '$lib/models/projects';

/** Where the reader is when they press the tab strip's "+". */
export interface NewNotePlace {
	/** The project the URL names: a project page, or the project of the open note. */
	readonly routeProject: ProjectId | undefined;
	/** The project of the focused tab. It outlives the note routes, so it is stale elsewhere. */
	readonly focusedProject: ProjectId | undefined;
	readonly onNoteRoute: boolean;
	readonly inbox: ProjectId | undefined;
}

/**
 * The project a note made from the tab strip belongs to: the one the reader is in.
 *
 * The strip used to file every note in the inbox, so a "New note" pressed on a project
 * page landed somewhere else than the project page's own "New note" button. The URL
 * decides first because the focused tab is not cleared when the reader leaves the note
 * routes; off a note or project page the inbox is the destination quick capture names.
 */
export const newNoteDestination = (place: NewNotePlace): ProjectId | undefined =>
	place.routeProject ?? (place.onNoteRoute ? place.focusedProject : undefined) ?? place.inbox;
