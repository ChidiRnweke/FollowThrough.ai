import { describe, expect, it } from 'vitest';
import {
	noteRecordSchema,
	projectRecordSchema,
	resourceDataSchemas,
	type WorkspaceRecord
} from '$lib/models/workspace-records';
import {
	noteBuilder,
	projectBuilder,
	suggestionBuilder,
	testNoteId,
	testActor,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
import { WorkspaceViews } from './index';

const note = noteRecordSchema.parse(noteBuilder());
const entries: [string, WorkspaceRecord][] = [
	[JSON.stringify(['notes', note.id]), { type: 'notes', value: note }],
	[
		JSON.stringify(['projects', note.projectId]),
		{ type: 'projects', value: projectRecordSchema.parse(projectBuilder()) }
	]
];

describe('normalized note views', () => {
	it('keeps the note body readable while identifying missing related content', () => {
		const relationship = resourceDataSchemas.note_relationships.parse({
			id: 'a0000000-0000-4000-8000-000000000001',
			userId: testActor().userId,
			sourceNoteId: testNoteId(2),
			targetNoteId: note.id,
			kind: 'mentions',
			createdAt: testNow,
			updatedAt: testNow
		});
		const records = new Map(entries);
		records.set(JSON.stringify(['note_relationships', relationship.id]), {
			type: 'note_relationships',
			value: relationship
		});
		const projected = new WorkspaceViews(records).note(note.id);
		expect({ note: projected?.view.note, missing: projected?.missing }).toEqual({
			note,
			missing: [{ type: 'notes', id: [testNoteId(2)] }]
		});
	});
	it('identifies missing suggestion provenance instead of inventing an origin', () => {
		const suggestion = resourceDataSchemas.suggestions.parse(suggestionBuilder());
		const records = new Map(entries);
		records.set(JSON.stringify(['suggestions', suggestion.id]), {
			type: 'suggestions',
			value: suggestion
		});
		const projected = new WorkspaceViews(records).note(note.id);
		expect({
			suggestions: projected?.view.pendingSuggestions,
			missing: projected?.missing
		}).toEqual({
			suggestions: [],
			missing: [{ type: 'provenance', id: [suggestion.provenanceId] }]
		});
	});
	it('uses the shared numbering cascade with the current project setting', () => {
		const records = new Map(entries);
		records.set(JSON.stringify(['projects', note.projectId]), {
			type: 'projects',
			value: projectRecordSchema.parse(projectBuilder({ sectionNumberingDefault: true }))
		});
		expect(new WorkspaceViews(records).note(note.id)?.view.sectionNumbering).toEqual({
			effective: true,
			noteOverride: undefined,
			inherited: true
		});
	});
});
