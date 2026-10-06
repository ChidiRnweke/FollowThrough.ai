import { gradeCalculator, loanCalculator, savingsSimulator, tripSplitter } from './calculators';
import { projectDashboard } from './dashboard';
import { decisionLog, decisionMatrix, statusBoard } from './records';
import { expenseTracker, habitTracker, okrTracker, relocationChecklist } from './trackers';
import type { WidgetScenario } from './scenario';

/** Every widget a person asks for in one prompt: the PR #299 examples first, then new ones. */
export const WIDGET_SCENARIOS: readonly WidgetScenario[] = [
	savingsSimulator,
	loanCalculator,
	expenseTracker,
	habitTracker,
	decisionMatrix,
	projectDashboard,
	relocationChecklist,
	statusBoard,
	decisionLog,
	gradeCalculator,
	tripSplitter,
	okrTracker
];
