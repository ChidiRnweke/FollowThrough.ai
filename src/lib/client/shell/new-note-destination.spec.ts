import { describe, expect, it } from 'vitest';
import type { ProjectId } from '$lib/models/projects';
import { newNoteDestination } from './new-note-destination';

const inbox = '00000000-0000-4000-8000-0000000000a1' as ProjectId;
const relaunch = '00000000-0000-4000-8000-0000000000a2' as ProjectId;
const hiring = '00000000-0000-4000-8000-0000000000a3' as ProjectId;

describe('the project a note from the tab strip belongs to', () => {
	it('is the project the reader is in, and the inbox anywhere else', () => {
		expect({
			projectPage: newNoteDestination({
				routeProject: relaunch,
				focusedProject: hiring,
				onNoteRoute: false,
				inbox
			}),
			note: newNoteDestination({
				routeProject: undefined,
				focusedProject: relaunch,
				onNoteRoute: true,
				inbox
			}),
			today: newNoteDestination({
				routeProject: undefined,
				focusedProject: hiring,
				onNoteRoute: false,
				inbox
			})
		}).toEqual({ projectPage: relaunch, note: relaunch, today: inbox });
	});
});
