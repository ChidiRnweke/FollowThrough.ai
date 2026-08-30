import { z } from 'zod';

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
	readonly syncStatus: 'loading' | 'synced' | 'saving' | 'pending' | 'conflict' | 'error';
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

const noteIdSchema = z.uuid().transform((value) => value as NoteId);
const projectIdSchema = z.uuid().transform((value) => value as ProjectId);

const noteContextSchema = z
	.object({ id: noteIdSchema, title: z.string(), projectId: projectIdSchema })
	.strict();

const paneContextSchema = noteContextSchema
	.extend({
		revision: z.number().int().nonnegative(),
		syncStatus: z.enum(['loading', 'synced', 'saving', 'pending', 'conflict', 'error']),
		dirty: z.boolean(),
		dirtyExcerpt: z.string().optional()
	})
	.strict();

const semanticInteractionSchema = z
	.object({
		kind: z.enum(['focus', 'select', 'open', 'edit']),
		resourceKind: z.enum(['note', 'todo', 'artifact', 'diagram', 'skill', 'chat']),
		resourceId: z.string(),
		occurredAt: z.iso.datetime()
	})
	.strict();

/** Strict runtime boundary for browser-captured application context. */
export const appContextSnapshotV1Schema: z.ZodType<AppContextSnapshotV1> = z
	.object({
		version: z.literal(1),
		capturedAt: z.iso.datetime(),
		client: z
			.object({
				locale: z.string().min(1),
				timeZone: z.string().min(1),
				localDate: z.iso.date(),
				layout: z.enum(['compact', 'wide'])
			})
			.strict(),
		surface: z
			.object({
				kind: z.enum(APP_SURFACE_KINDS),
				presentation: z.enum(['right_panel', 'full_page']),
				filters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional()
			})
			.strict(),
		currentProject: z.object({ id: projectIdSchema, name: z.string() }).strict().optional(),
		activeResource: z
			.object({
				kind: z.enum(['project', 'note', 'todo', 'artifact', 'diagram', 'skill', 'chat']),
				id: z.string(),
				title: z.string(),
				projectId: projectIdSchema.optional()
			})
			.strict()
			.optional(),
		workbench: z
			.object({
				openTabs: z.array(noteContextSchema),
				visiblePanes: z.array(paneContextSchema),
				focusedNoteId: noteIdSchema.optional(),
				otherVisibleNoteId: noteIdSchema.optional(),
				openChatTabs: z
					.array(
						z
							.object({
								sessionKey: z.string(),
								conversationId: z.string().min(1).optional(),
								title: z.string()
							})
							.strict()
					)
					.optional()
			})
			.strict()
			.optional(),
		recentInteractions: z.array(semanticInteractionSchema)
	})
	.strict();

/** Parse an external app-context snapshot before it crosses into application logic. */
export const parseAppContextSnapshotV1 = (value: unknown): AppContextSnapshotV1 =>
	appContextSnapshotV1Schema.parse(value);

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
