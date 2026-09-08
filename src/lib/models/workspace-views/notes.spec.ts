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
	testSuggestionId,
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

describe('normalized skill detail', () => {
	it('joins metadata to the current local instruction document', () => {
		const records = new Map(entries);
		records.set(JSON.stringify(['notes', note.id]), {
			type: 'notes',
			value: { ...note, kind: 'skill', plainText: 'Local instructions' }
		});
		const metadata = resourceDataSchemas.skills.parse({
			noteId: note.id,
			name: 'Review',
			slug: 'review',
			description: 'Review a note',
			triggerHints: [],
			metadata: {},
			allowImplicitInvocation: true,
			isEnabled: true,
			createdAt: testNow,
			updatedAt: testNow
		});
		records.set(JSON.stringify(['skills', note.id]), { type: 'skills', value: metadata });
		expect(new WorkspaceViews(records).skill(note.id)).toEqual({
			...metadata,
			note: { ...note, kind: 'skill', plainText: 'Local instructions' }
		});
	});
	it('does not invent skill metadata when only the note is downloaded', () => {
		expect(new WorkspaceViews(new Map(entries)).skill(note.id)).toBeNull();
	});
});

it('keeps suggestions scoped to their note without a mutable per-pane copy', () => {
	const first = suggestionBuilder({ sourceAnchorId: undefined });
	const secondNote = noteBuilder({ id: testNoteId(2) });
	const second = suggestionBuilder({
		id: testSuggestionId(2),
		noteId: secondNote.id,
		sourceAnchorId: undefined
	});
	const provenance = resourceDataSchemas.provenance.parse({
		id: first.provenanceId,
		userId: testActor().userId,
		createdAt: testNow,
		producerKind: 'agent',
		producerName: 'FollowThrough Workbench Agent',
		pipeline: 'agent',
		runId: 'a0000000-0000-4000-8000-000000000008',
		model: 'fixture',
		metadata: {}
	});
	const records = new Map(entries);
	records.set(JSON.stringify(['notes', secondNote.id]), {
		type: 'notes',
		value: noteRecordSchema.parse(secondNote)
	});
	records.set(JSON.stringify(['suggestions', first.id]), { type: 'suggestions', value: first });
	records.set(JSON.stringify(['suggestions', second.id]), { type: 'suggestions', value: second });
	records.set(JSON.stringify(['provenance', provenance.id]), {
		type: 'provenance',
		value: provenance
	});
	const views = new WorkspaceViews(records);
	expect([
		views.note(note.id)?.view.pendingSuggestions.map((item) => item.suggestion.id),
		views.note(secondNote.id)?.view.pendingSuggestions.map((item) => item.suggestion.id)
	]).toEqual([[first.id], [second.id]]);
});
