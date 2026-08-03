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

	it('omits structured arguments from the detail lines', () => {
		expect(approvalFields({ edits: [{ find: 'a' }] }, shell).details).toEqual([]);
	});
});

describe('Approval fields surface structured content as items', () => {
	const createTodos = {
		projectId: PROJECT_ID,
		todos: [
			{
				title: 'Draft the RFC',
				description: 'Cover the rollout plan',
				responsibility: 'mine',
				dueDate: '2026-08-10'
			},
			{ title: 'Book the review', responsibility: 'waiting_on', waitingOn: 'Priya' }
		]
	};

	it('renders one item per element, each led by its own title', () => {
		const fields = approvalFields(createTodos, shell);
		expect(fields.items?.map((item) => item.headline)).toEqual([
			'Draft the RFC',
			'Book the review'
		]);
	});

	it('keeps each item’s readable fields as labelled lines', () => {
		const [first] = approvalFields(createTodos, shell).items ?? [];
		expect(first?.details).toEqual([
			'Description: Cover the rollout plan',
			'Responsibility: mine',
			'Due: 2026-08-10'
		]);
	});

	it('leaves no trace of an id inside the items', () => {
		const fields = approvalFields(createTodos, shell);
		const rendered = fields.items?.flatMap((item) => [item.headline, ...item.details]).join(' ');
		expect(rendered).not.toContain(PROJECT_ID);
	});

	it('still folds the project id into the place line', () => {
		expect(approvalFields(createTodos, shell).location).toBe('in Platform Notes');
	});

	it('drops values inside an item that would not read as a line', () => {
		const [item] =
			approvalFields({ todos: [{ title: 'Draft', metadata: { nested: true } }] }, shell).items ??
			[];
		expect(item?.details).toEqual([]);
	});

	it('keeps long item fields visible as lines, since items have no prose outlet', () => {
		const [item] =
			approvalFields({ todos: [{ title: 'Draft', description: 'a'.repeat(200) }] }, shell).items ??
			[];
		expect(item?.details).toEqual([`Description: ${'a'.repeat(200)}`]);
	});

	it('omits the items list when no argument is an array of objects', () => {
		expect(approvalFields(createNote, shell).items).toBeUndefined();
	});
});

describe('Approval fields name the note an id-only call acts on', () => {
	it('states the note as the subject when the call has no title of its own', () => {
		expect(approvalFields({ noteId: PARENT_ID }, shell).headline).toBe('Infrastructure');
	});

	it('keeps the new title as the headline when the call carries one', () => {
		expect(approvalFields({ noteId: PARENT_ID, title: 'Renamed' }, shell).headline).toBe('Renamed');
	});

	it('names the note as context when the call carries a new title', () => {
		expect(approvalFields({ noteId: PARENT_ID, title: 'Renamed' }, shell).location).toBe(
			'on Infrastructure'
		);
	});

	it('leaves no trace of the note id anywhere in the rendered lines', () => {
		const fields = approvalFields({ noteId: PARENT_ID }, shell);
		const rendered = [fields.headline, fields.location, ...fields.details].join(' ');
		expect(rendered).not.toContain(PARENT_ID);
	});
});
