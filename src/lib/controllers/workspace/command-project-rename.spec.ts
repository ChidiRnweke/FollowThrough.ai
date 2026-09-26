import { expect, it } from 'vitest';
import { prepareWorkspaceCommand } from './commands';
import {
	projectBuilder,
	testActor,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';

it('retains project description when a local rename changes only its name', () => {
	const project = projectBuilder({ description: 'Keep this context', role: 'inbox' });
	expect(
		prepareWorkspaceCommand(
			{ kind: 'renameProject', projectId: project.id, name: '  Renamed inbox  ' },
			{ type: 'projects', value: project },
			{ userId: testActor().userId, now: testNow, records: new Map(), inventory: 'complete' }
		).local
	).toEqual({ type: 'projects', value: { ...project, name: 'Renamed inbox', updatedAt: testNow } });
});
