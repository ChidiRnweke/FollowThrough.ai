import { widgetTemplates } from '$lib/models/widgets';
import type { WorkspaceFixture } from '../../lab/workspace';
import type { WidgetScenario } from './scenario';

const PROJECT = 'Website relaunch';

/** Due dates far from any run date, so "overdue" does not depend on when the eval runs. */
const PAST = '2020-01-15';
const FUTURE = '2099-06-30';

/**
 * The PR's dashboard capture: five open todos, four of them dated and two of those overdue, one
 * waiting on someone else, and two done.
 */
const relaunchWorkspace: WorkspaceFixture = {
	memories: ['Always answer in English.', 'Name: Robin Aldridge.'],
	projects: [
		{
			name: PROJECT,
			notes: [
				{
					title: 'Launch plan',
					body: 'The relaunch moves the marketing site to the new design system and a new host.'
				}
			]
		}
	],
	todos: [
		{ title: 'Write launch announcement', projectName: PROJECT, dueDate: PAST },
		{ title: 'Fix checkout redirect', projectName: PROJECT, dueDate: PAST, status: 'in_progress' },
		{ title: 'Migrate blog posts', projectName: PROJECT, dueDate: FUTURE },
		{
			title: 'Design sign-off',
			projectName: PROJECT,
			dueDate: FUTURE,
			responsibility: { kind: 'waiting_on', waitingOn: 'Agency' }
		},
		{ title: 'Set up analytics', projectName: PROJECT, status: 'backlog' },
		{ title: 'Choose hosting', projectName: PROJECT, status: 'done' },
		{ title: 'Draft sitemap', projectName: PROJECT, status: 'done' }
	]
};

export const projectDashboard: WidgetScenario = {
	id: 'widget-build-project-dashboard',
	name: "a project dashboard counts the project's todos and follows them as they change",
	prompt:
		'In my Launch plan note, add a dashboard widget for this project: how many todos are open, how many are overdue, how many are waiting on others, and how many are done, a chart of todos by status, and a list of the overdue ones. It should stay up to date as the todos change.',
	workspace: relaunchWorkspace,
	projectName: PROJECT,
	noteTitle: 'Launch plan',
	titleFragment: /dashboard|relaunch|launch/i,
	probe: [
		{ kind: 'reads', label: /^open/i, near: 5, tolerance: 0 },
		{ kind: 'reads', label: /overdue/i, near: 2, tolerance: 0 },
		{ kind: 'reads', label: /waiting/i, near: 1, tolerance: 0 },
		{ kind: 'reads', label: /done|complete/i, near: 2, tolerance: 0 },
		{ kind: 'mentions', text: /write launch announcement/i },
		{ kind: 'chart', points: 2 },
		{
			kind: 'addTodo',
			todo: { title: 'Fix broken footer links', status: 'open', dueDate: PAST }
		},
		{ kind: 'reads', label: /^open/i, near: 6, tolerance: 0 },
		{ kind: 'reads', label: /overdue/i, near: 3, tolerance: 0 },
		{ kind: 'mentions', text: /footer links/i }
	],
	reference: widgetTemplates.dashboard
};
