import { describe, expect, it } from 'vitest';
import { newNote, newProject } from './index';
import {
	projectBuilder,
	noteBuilder,
	testNoteId,
	testProjectId,
	testActor,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';

describe('offline creation', () => {
	it('keeps the client project identity and normalizes its title', () => {
		expect(newProject(testProjectId(), testActor().userId, '  Research  ', testNow)).toEqual({
			id: testProjectId(),
			userId: testActor().userId,
			name: 'Research',
			role: 'workspace',
			createdAt: testNow,
			updatedAt: testNow
		});
	});
	it('creates a note that can immediately reference a locally created folder', () => {
		const project = newProject(testProjectId(), testActor().userId, 'Research', testNow);
		const folder = newNote(testNoteId(), project, 'Reading', 'folder', [], testNow);
		expect(
			newNote(testNoteId(2), project, '  First draft  ', 'note', [folder], testNow, folder.id)
		).toEqual({
			...noteBuilder({ id: testNoteId(2), title: 'First draft', parentId: folder.id }),
			document: { type: 'doc', content: [] },
			plainText: ''
		});
	});
	it('rejects a parent that belongs to another project', () => {
		expect(() =>
			newNote(
				testNoteId(2),
				projectBuilder(),
				'Draft',
				'note',
				[noteBuilder({ kind: 'folder', projectId: testProjectId(2) })],
				testNow,
				testNoteId()
			)
		).toThrow('An active parent folder is required');
	});
	it('keeps the server distinction between note sibling counts and active folder sibling counts', () => {
		const entries = [noteBuilder({ archivedAt: testNow })];
		expect(
			['note', 'folder'].map(
				(kind) =>
					newNote(
						testNoteId(2),
						projectBuilder(),
						'New',
						kind as 'note' | 'folder',
						entries,
						testNow
					).position
			)
		).toEqual([1, 0]);
	});
});
