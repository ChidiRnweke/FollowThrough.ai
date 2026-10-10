import { expect, it } from 'vitest';
import { projectBuilder, testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';
import { AgentProjectChoiceService } from './agent-choice';

it('requires project creation before a scoped write in an empty workspace', () => {
	expect(() => new AgentProjectChoiceService().requireChoice([], 'create a note')).toThrow(
		'projectId is required to create a note, and this workspace has no projects yet. Call create_project first, then retry with its id.'
	);
});
it('asks for an explicit choice even when only one project exists', () => {
	const project = projectBuilder({ name: 'Inbox' });
	expect(() => new AgentProjectChoiceService().requireChoice([project], 'create a skill')).toThrow(
		`projectId is required to create a skill. Retry naming one of these projects: Inbox (${project.id}).`
	);
});
it('reports every available project without selecting one implicitly', () => {
	const projects = [
		projectBuilder({ name: 'Alpha' }),
		projectBuilder({ id: testProjectId(2), name: 'Beta' })
	];
	expect(() => new AgentProjectChoiceService().requireChoice(projects, 'create a widget')).toThrow(
		`projectId is required to create a widget. Retry naming one of these projects: Alpha (${projects[0].id}), Beta (${projects[1].id}).`
	);
});
