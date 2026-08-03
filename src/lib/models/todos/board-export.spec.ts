import { describe, expect, it } from 'vitest';
import type { Todo, TodoView } from '$lib/models/todos';
import { boardExportSlug, boardMarkdown } from './index';

const generatedAt = new Date(2026, 7, 3); // 3 Aug 2026, local time

const view = (overrides: Partial<Todo> = {}): TodoView => ({
	todo: {
		id: 'todo-1',
		userId: 'user-1',
		projectId: 'project-1',
		title: 'Send the design',
		status: 'open',
		responsibility: 'mine',
		createdAt: '2026-08-01T09:00:00Z',
		updatedAt: '2026-08-01T09:00:00Z',
		...overrides
	} as Todo
});

const exportBoard = (
	todos: readonly TodoView[],
	opts: Partial<Parameters<typeof boardMarkdown>[1]> = {}
) => boardMarkdown(todos, { title: 'Todos', generatedAt, ...opts });

const sections = (markdown: string) => markdown.match(/^## .*$/gm);

describe('Kanban board Markdown export', () => {
	it('opens with the title and the generation date', () => {
		expect(exportBoard([view()]).startsWith('# Todos\n\nGenerated 3 Aug 2026\n')).toBe(true);
	});

	it('renders sections in kanban column order', () => {
		const markdown = exportBoard([
			view({ status: 'done', title: 'Done first in code' }),
			view({ status: 'backlog', title: 'Backlog first on board' }),
			view({ status: 'in_progress', title: 'In flight' }),
			view({ status: 'open', title: 'Open' })
		]);
		expect(sections(markdown)).toEqual(['## Backlog', '## Open', '## In progress', '## Done']);
	});

	it('omits empty columns', () => {
		expect(sections(exportBoard([view({ status: 'open' })]))).toEqual(['## Open']);
	});

	it('excludes cancelled todos, which the board never renders', () => {
		const markdown = exportBoard([view({ status: 'cancelled', title: 'Called off' })]);
		expect(markdown).toBe('# Todos\n\nGenerated 3 Aug 2026\n');
	});

	it('checks off done cards only', () => {
		const markdown = exportBoard([
			view({ status: 'done', title: 'Finished' }),
			view({ status: 'open', title: 'Pending' })
		]);
		expect(markdown.match(/^- .*$/gm)).toEqual(['- [ ] **Pending**', '- [x] **Finished**']);
	});

	it('collapses multi-line titles onto one list line', () => {
		expect(exportBoard([view({ title: 'Send the\ndesign   draft' })])).toContain(
			'- [ ] **Send the design draft**'
		);
	});

	it('renders priority, category and the waiting-on person as compact metadata', () => {
		const markdown = exportBoard([
			view({
				priority: 'high',
				category: 'Client work',
				responsibility: 'waiting_on',
				waitingOn: 'Sam'
			})
		]);
		expect(markdown).toContain('- [ ] **Send the design** · High · Client work · waiting on Sam');
	});

	it('marks an open card past its due date as overdue', () => {
		const markdown = exportBoard([view({ dueDate: '2026-08-01' as Todo['dueDate'] })]);
		expect(markdown).toContain('due 2026-08-01 (overdue)');
	});

	it('does not mark a future or done card as overdue', () => {
		const markdown = exportBoard([
			view({ title: 'Future', dueDate: '2026-08-10' as Todo['dueDate'] }),
			view({ title: 'Late but done', status: 'done', dueDate: '2026-08-01' as Todo['dueDate'] })
		]);
		expect(markdown.match(/due [^\n]*/g)).toEqual(['due 2026-08-10', 'due 2026-08-01']);
	});

	it('shows the project name on each card when project names are provided', () => {
		const markdown = exportBoard([view()], {
			projectNames: new Map([['project-1', 'Apollo']])
		});
		expect(markdown).toContain('- [ ] **Send the design** · Apollo');
	});

	it('omits project names entirely when no map is provided', () => {
		expect(exportBoard([view()])).toBe(
			'# Todos\n\nGenerated 3 Aug 2026\n\n## Open\n\n- [ ] **Send the design**\n'
		);
	});
});

describe('Board export filename slug', () => {
	it('slugifies a project name', () => {
		expect(boardExportSlug('Apollo 11 Redesign')).toBe('apollo-11-redesign');
	});

	it('falls back to a generic slug for an empty name', () => {
		expect(boardExportSlug('!!!')).toBe('board');
	});
});
