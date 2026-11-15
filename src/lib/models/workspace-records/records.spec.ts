import { describe, expect, it } from 'vitest';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { storedDocumentReadSchema } from '$lib/models/notes';
import { agentPayloadObjectSchema } from '$lib/models/agent/payload';
import { noteRecordSchema, scheduleRecordSchema } from './index';

describe('cached record boundaries', () => {
	it('preserves an explicitly unreadable block across repeated cache reads', () => {
		const note = {
			...noteBuilder(),
			document: storedDocumentReadSchema.parse({
				type: 'doc',
				content: [{ type: 'future-block', text: 'Keep this content' }]
			})
		};
		expect(noteRecordSchema.parse(noteRecordSchema.parse(note)).document).toEqual(note.document);
	});

	it('reads a schedule this browser stored before a schedule could name skills', () => {
		// The record as release 6.6.0 stored it: no project, no model, no skills field.
		const stored = {
			id: '5c000000-0000-4000-8000-000000000001',
			userId: '00000000-0000-4000-8000-000000000001',
			title: 'Morning brief',
			prompt: 'Write a brief of what is due today as a note in Inbox.',
			recurrence: { kind: 'weekdays', time: { hour: 8, minute: 0 } },
			timeZone: 'Europe/Brussels',
			executionMode: 'approval_required',
			status: 'active',
			nextRunAt: '2026-11-17T07:00:00.000Z',
			createdAt: '2026-11-16T08:12:00.000Z',
			updatedAt: '2026-11-16T08:12:00.000Z'
		};

		expect(scheduleRecordSchema.parse(stored)).toEqual({ ...stored, skillNoteIds: [] });
	});

	it('does not turn an invalid agent payload into an empty cached object', () => {
		expect(agentPayloadObjectSchema.safeParse(new Date()).success).toBe(false);
	});
});
