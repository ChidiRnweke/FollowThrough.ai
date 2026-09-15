import { describe, expect, it } from 'vitest';
import { resourceDataSchemas } from '$lib/models/workspace-records';
import { testNoteId, testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { skillMetadataWrite, mutationResource } from './index';

const entry = resourceDataSchemas.skills.parse({
	noteId: testNoteId(),
	name: 'Writing',
	slug: 'writing',
	description: 'Write clearly',
	triggerHints: ['editing'],
	metadata: {},
	allowImplicitInvocation: true,
	isEnabled: true,
	createdAt: testNow,
	updatedAt: testNow
});

describe('local skill metadata edits', () => {
	it('guards the metadata record rather than its independent note body', () => {
		expect(mutationResource(skillMetadataWrite(entry, { description: 'Edited' }).command)).toEqual({
			type: 'skills',
			id: [entry.noteId]
		});
	});
	it('retains other metadata while disabling a skill', () => {
		expect(skillMetadataWrite(entry, { isEnabled: false }).local).toEqual({
			type: 'skills',
			value: { ...entry, isEnabled: false }
		});
	});
	it('matches the domain rule that an empty description retains the existing description', () => {
		expect(
			skillMetadataWrite(entry, { description: '  ', displayName: ' Renamed ' }).local
		).toEqual({ type: 'skills', value: { ...entry, name: 'Renamed' } });
	});
});
