import type { NoteId, ProjectId, TextSelection } from './shared';

export type AppSurfaceKind =
	| 'today'
	| 'todos'
	| 'project'
	| 'project_todos'
	| 'project_memory'
	| 'project_attachments'
	| 'artifacts'
	| 'note_workbench'
	| 'diagram_editor'
	| 'chats'
	| 'chat'
	| 'skills'
	| 'skill'
	| 'profile'
	| 'settings'
	| 'unknown';

export interface NoteContext {
	readonly id: NoteId;
	readonly title: string;
	readonly projectId: ProjectId;
}

export interface PaneContext extends NoteContext {
	readonly revision: number;
	readonly syncStatus: string;
	readonly dirty: boolean;
	readonly dirtyExcerpt?: string;
}

export interface SemanticInteraction {
	readonly kind: 'focus' | 'select' | 'open' | 'edit';
	readonly resourceKind: 'note' | 'todo' | 'artifact' | 'diagram' | 'skill' | 'chat';
	readonly resourceId: string;
	readonly occurredAt: string;
}

export interface AppContextSnapshotV1 {
	readonly version: 1;
	readonly capturedAt: string;
	readonly client: {
		readonly locale: string;
		readonly timeZone: string;
		readonly localDate: string;
		readonly layout: 'compact' | 'wide';
	};
	readonly surface: {
		readonly kind: AppSurfaceKind;
		readonly presentation: 'right_panel' | 'full_page';
		readonly filters?: Readonly<Record<string, string | number | boolean>>;
	};
	readonly currentProject?: { readonly id: ProjectId; readonly name: string };
	readonly activeResource?: {
		readonly kind: 'project' | 'note' | 'todo' | 'artifact' | 'diagram' | 'skill' | 'chat';
		readonly id: string;
		readonly title: string;
		readonly projectId?: ProjectId;
	};
	readonly workbench?: {
		readonly openTabs: readonly NoteContext[];
		readonly visiblePanes: readonly PaneContext[];
		readonly focusedNoteId?: NoteId;
		readonly otherVisibleNoteId?: NoteId;
	};
	readonly selection?: TextSelection;
	readonly recentInteractions: readonly SemanticInteraction[];
}

export type ProjectTransition =
	'same_project' | 'different_project' | 'origin_unscoped' | 'screen_unscoped';

export interface ResolvedAppContextV1 extends AppContextSnapshotV1 {
	readonly conversationOrigin: {
		readonly projectId?: ProjectId;
		readonly projectName?: string;
		readonly noteId?: NoteId;
	};
	readonly projectTransition: ProjectTransition;
}
