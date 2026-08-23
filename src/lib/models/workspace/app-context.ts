type Brand<T, Name extends string> = T & { readonly __brand: Name };
type NoteId = Brand<string, 'NoteId'>;
type ProjectId = Brand<string, 'ProjectId'>;

/**
 * Every screen the agent can be told it is looking at.
 *
 * A list rather than a bare union because the request boundary validates against
 * it: `agent-request-factory.ts` builds its zod enum from this array, so a surface
 * added here cannot be one the server then rejects. It drifted once — `diagrams`
 * and `diagram_studio` were added to the type and not to the validator, and every
 * chat sent from those screens came back 400 Bad Request before reaching the agent.
 */
export const APP_SURFACE_KINDS = [
	'today',
	'todos',
	'project',
	'project_todos',
	'project_memory',
	'project_attachments',
	'artifacts',
	'note_workbench',
	'diagram_editor',
	'diagram_studio',
	'diagrams',
	'chats',
	'chat',
	'skills',
	'skill',
	'profile',
	'settings',
	'unknown'
] as const;

export type AppSurfaceKind = (typeof APP_SURFACE_KINDS)[number];

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
		/**
		 * Chat tabs open beside the notes. Additive and optional, so the snapshot
		 * stays at version 1 and a client left open across a deploy still
		 * validates in both directions.
		 */
		readonly openChatTabs?: readonly {
			readonly sessionKey: string;
			readonly conversationId?: string;
			readonly title: string;
		}[];
	};
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
	/**
	 * Present only when the user moved screens between staging the request and
	 * sending it. The snapshot above is the active scope; `note` states the
	 * divergence in the terms the agent should reason about.
	 */
	readonly requestedScope?: {
		readonly projectId?: ProjectId;
		readonly projectName?: string;
		readonly noteId?: NoteId;
		readonly noteTitle?: string;
		readonly note: string;
	};
}
