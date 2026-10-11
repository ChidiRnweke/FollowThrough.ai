import { expect, it } from 'vitest';
import { ProjectChoiceRequiredError } from '$lib/errors';
import { projectBuilder, testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';
import { ProjectRules } from './rules';

const choice = (projects: Parameters<ProjectRules['requireChoice']>[0], action: string) => {
	try {
		new ProjectRules().requireChoice(projects, action);
	} catch (error) {
		if (error instanceof ProjectChoiceRequiredError) return error;
		throw error;
	}
	throw new Error('Expected a project choice to be required');
};

it('requires a project in an empty workspace and offers no choices', () => {
	const error = choice([], 'create a note');
	expect({ message: error.message, projects: error.projects }).toEqual({
		message: 'A project is required to create a note, and this workspace has no projects yet.',
		projects: []
	});
});
it('asks for an explicit choice even when only one project exists', () => {
	const project = projectBuilder({ name: 'Inbox' });
	expect(choice([project], 'create a skill').projects).toEqual([{ id: project.id, name: 'Inbox' }]);
});
it('reports every available project without selecting one implicitly', () => {
	const projects = [
		projectBuilder({ name: 'Alpha' }),
		projectBuilder({ id: testProjectId(2), name: 'Beta' })
	];
	expect(choice(projects, 'create a widget').projects).toEqual([
		{ id: projects[0].id, name: 'Alpha' },
		{ id: projects[1].id, name: 'Beta' }
	]);
});
