import { describe, expect, it } from 'vitest';
import type { NoteSummary } from '$lib/models/notes';
import type { Project } from '$lib/models/projects';
import type { ShellContext } from '$lib/models/workspace';
import { approvalFields } from './tool-approval-fields';

const PROJECT_ID = 'e0d3f07c-460b-40c3-9b8c-a8dc00ddc565';
const PARENT_ID = '9e8e1812-0a7c-474d-96e4-65c5b60b3f75';

const shell = {
	projects: [{ id: PROJECT_ID, name: 'Platform Notes' } as unknown as Project],
	noteTree: [{ id: PARENT_ID, title: 'Infrastructure' } as unknown as NoteSummary]
} as unknown as ShellContext;

/** The payload that shipped raw UUIDs to the chat sidebar. */
const createNote = {
	title: 'Databricks Agent Runtime',
	parentId: PARENT_ID,
	projectId: PROJECT_ID
};

describe('Approval fields lead with the subject of the change', () => {
	it('states the proposed title on its own', () => {
		expect(approvalFields(createNote, shell).headline).toBe('Databricks Agent Runtime');
	});

	it('falls back to a name when there is no title', () => {
		expect(approvalFields({ name: 'Roadmap' }, shell).headline).toBe('Roadmap');
	});
});

describe('Approval fields never show an identifier', () => {
	it('leaves no trace of an id anywhere in the rendered lines', () => {
		const fields = approvalFields(createNote, shell);
		const rendered = [fields.headline, fields.location, ...fields.details].join(' ');
		expect(rendered).not.toContain(PARENT_ID);
	});

	it('drops an id-shaped argument from the detail lines', () => {
		expect(approvalFields({ todoId: PARENT_ID, status: 'done' }, shell).details).toEqual([
			'Status: done'
		]);
	});
});

describe('Approval fields resolve ids to the place a change lands', () => {
	it('names both the project and the parent note', () => {
		expect(approvalFields(createNote, shell).location).toBe('in Platform Notes › Infrastructure');
	});

	it('names the project alone when there is no parent', () => {
		expect(approvalFields({ projectId: PROJECT_ID }, shell).location).toBe('in Platform Notes');
	});

	it('omits the place entirely when no id can be named', () => {
		expect(approvalFields(createNote, undefined).location).toBeUndefined();
	});
});

describe('Approval fields read as labelled values', () => {
	it('labels an argument key as prose rather than as a field name', () => {
		expect(approvalFields({ dueDate: '2026-08-01' }, shell).details).toEqual(['Due: 2026-08-01']);
	});

	it('leaves long prose out of the detail lines so it can render as markdown', () => {
		expect(approvalFields({ markdown: 'a'.repeat(200) }, shell).details).toEqual([]);
	});

	it('omits structured arguments that would not read as a line', () => {
		expect(approvalFields({ edits: [{ find: 'a' }] }, shell).details).toEqual([]);
	});
});
