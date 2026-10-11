import { expect, it } from 'vitest';
import { resourceDataSchemas, type WorkspaceRecord } from '$lib/models/workspace-records';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
const { workspaceRecordIdentity } = new WorkspaceCommandRulesService();

const { workspaceResourceKey } = new WorkspaceCommandRulesService();
import type { LocalDate } from '$lib/models/workspace';
import {
	memorySuggestionBuilder,
	noteBuilder,
	projectBuilder,
	testActor,
	testNow,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { createWorkspaceViews } from '$lib/factories/workspace/views';

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
	return createWorkspaceViews(
		new Map(
			records.map((record) => [workspaceResourceKey(workspaceRecordIdentity(record)), record])
		)
	);
};
it('hides an archived source proposal from all active projections while preserving its row', () => {
	const views = setup(true);
	expect({
		proposals: views.memorySuggestions(),
		shellCount: views.shell(user.id)?.pendingSuggestionCount,
		todayCount: views.today('2026-09-27' as LocalDate).pendingSuggestionCount,
		stored: views.get('suggestions', suggestion.id)
	}).toEqual({ proposals: [], shellCount: 0, todayCount: 0, stored: suggestion });
});
it('keeps profile memory proposals from an active source project', () => {
	expect(
		setup(false)
			.memorySuggestions()
			.map((view) => view.suggestion.id)
	).toEqual([suggestion.id]);
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
