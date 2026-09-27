import { expect, it } from 'vitest';
import {
	resourceDataSchemas,
	workspaceRecordIdentity,
	type WorkspaceRecord
} from '$lib/models/workspace-records';
import { workspaceResourceKey } from '$lib/models/workspace-sync';
import type { LocalDate } from '$lib/models/workspace';
import {
	memorySuggestionBuilder,
	noteBuilder,
	projectBuilder,
	testActor,
	testNow,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { WorkspaceViews } from './views';

const source = noteBuilder();
const suggestion = memorySuggestionBuilder({ noteId: source.id });
const user = resourceDataSchemas.users.parse({
	id: testActor().userId,
	email: 'reader@example.test',
	displayName: 'Reader',
	role: 'USER',
	createdAt: testNow,
	updatedAt: testNow
});
const provenance = resourceDataSchemas.provenance.parse({
	id: suggestion.provenanceId,
	userId: suggestion.userId,
	createdAt: testNow,
	producerKind: 'agent',
	producerName: 'Agent memory',
	pipeline: 'memory',
	metadata: {}
});
const setup = (archived: boolean, proposal = suggestion) => {
	const records: WorkspaceRecord[] = [
		{ type: 'users', value: user },
		{ type: 'projects', value: projectBuilder(archived ? { archivedAt: testNow } : {}) },
		{ type: 'projects', value: projectBuilder({ id: testProjectId(2) }) },
		{ type: 'notes', value: source },
		{ type: 'suggestions', value: proposal },
		{ type: 'provenance', value: provenance }
	];
	return new WorkspaceViews(
		new Map(
			records.map((record) => [workspaceResourceKey(workspaceRecordIdentity(record)), record])
		)
	);
};
it('hides profile memory proposals from an archived source project', () => {
	expect(setup(true).memorySuggestions()).toEqual([]);
});
it('keeps profile memory proposals from an active source project', () => {
	expect(
		setup(false)
			.memorySuggestions()
			.map((view) => view.suggestion.id)
	).toEqual([suggestion.id]);
});
it('excludes archived origins from shell attention counts', () => {
	expect(setup(true).shell(user.id)?.pendingSuggestionCount).toBe(0);
});
it('excludes archived origins from today attention counts', () => {
	expect(setup(true).today('2026-09-27' as LocalDate).pendingSuggestionCount).toBe(0);
});
it('excludes archived project payloads even without a source note', () => {
	const proposal = memorySuggestionBuilder({
		payload: {
			scope: 'project',
			projectId: source.projectId,
			operation: 'add',
			content: 'Project fact'
		}
	});
	expect(setup(true, proposal).shell(user.id)?.pendingSuggestionCount).toBe(0);
});
it('retains the hidden proposal record', () => {
	expect(setup(true).get('suggestions', suggestion.id)).toEqual(suggestion);
});
