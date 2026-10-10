import type { NoteView as AggregateNoteView } from '$lib/models/notes';
import type { BacklinkView } from '$lib/models/relationships';
import type { ReferenceView } from '$lib/models/references';
import type { Diagram } from '$lib/models/diagrams';
import type { SuggestionView } from '$lib/models/suggestions';

export type NoteView = AggregateNoteView<
	BacklinkView,
	ReferenceView,
	Diagram,
	TodoView,
	SuggestionView
>;

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

import type { WorkspaceRecord, WorkspaceValues } from '$lib/models/workspace-records';

export type WorkspaceSkill = WorkspaceValues['skills'] & {
	readonly note: WorkspaceValues['notes'];
};

export interface WorkspaceViewState {
	readonly records: ReadonlyMap<string, WorkspaceRecord>;
	readonly byType: ReadonlyMap<WorkspaceRecord['type'], readonly WorkspaceRecord[]>;
}
