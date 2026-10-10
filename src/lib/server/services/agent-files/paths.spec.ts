import { expect, it } from 'vitest';
import { AgentFilePathsService } from './paths';
import {
	diagramBuilder,
	testProjectId,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { testAttachmentId } from '$lib/testing/attachments/fixtures/views';

it.each([
	['.', '/'],
	['projects/./a//b/../c', '/projects/a/c'],
	['/../../a', '/a']
])('normalizes %s to %s without guessing a resource', (input, expected) => {
	expect(new AgentFilePathsService().normalize(input)).toBe(expected);
});
it('uses the exact canonical resource names shared by context and reads', () => {
	const paths = new AgentFilePathsService();
	const project = testProjectId();
	const note = testNoteId();
	const attachment = testAttachmentId();
	const diagram = diagramBuilder();
	expect([
		paths.note(project, note),
		paths.revision(project, note, 7),
		paths.attachment(project, attachment),
		paths.diagram(diagram)
	]).toEqual([
		`/projects/${project}/notes/${note}.md`,
		`/projects/${project}/notes/${note}/versions/7.md`,
		`/projects/${project}/attachments/${attachment}.txt`,
		`/projects/${project}/diagrams/${diagram.id}.mmd`
	]);
});
