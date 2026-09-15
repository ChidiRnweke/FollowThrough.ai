import type {
	ShellContext as AggregateShellContext,
	TodayView as AggregateTodayView
} from '$lib/models/workspace';
import type { User } from '$lib/models/identity';
import type { Project } from '$lib/models/projects';
import type { NoteSummary } from '$lib/models/notes';
import type { SkillSummary } from '$lib/models/skills';
import type { TodoView } from '$lib/models/todos';

export type ShellContext = AggregateShellContext<User, Project, NoteSummary, SkillSummary>;
export type TodayView = AggregateTodayView<TodoView, NoteSummary>;
