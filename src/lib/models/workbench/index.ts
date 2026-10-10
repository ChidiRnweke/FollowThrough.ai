import { z } from 'zod';
import type { DiagramId } from '$lib/models/diagrams';
import type { NoteId } from '$lib/models/notes';
import type { WidgetId } from '$lib/models/widgets';
import { type ChatSessionKey } from '$lib/models/chat';
import type { ProjectId } from '$lib/models/projects';

export const workbenchTabIdSchema = z.union([
	z.uuid(),
	z
		.string()
		.regex(
			/^(?:chat:|diagram:|widget:)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
		),
	z.literal('search')
]);

/** Device-local layout for one account. URLs remain the source of navigation focus. */
export const workbenchLayoutSchema = z.object({
	id: z.literal('current'),
	openTabs: z.array(workbenchTabIdSchema).readonly(),
	focusedNoteId: workbenchTabIdSchema.nullable(),
	pinnedTabs: z.array(workbenchTabIdSchema).readonly(),
	recentlyUsed: z.array(workbenchTabIdSchema).readonly(),
	stripHidden: z.boolean(),
	splitRatio: z.number().min(0.25).max(0.75)
});
export type WorkbenchLayoutRecord = z.infer<typeof workbenchLayoutSchema>;
export type TabId = string;

export type TabRef =
	| { readonly kind: 'note'; readonly noteId: NoteId }
	| { readonly kind: 'chat'; readonly sessionKey: ChatSessionKey }
	| { readonly kind: 'diagram'; readonly diagramId: DiagramId }
	| { readonly kind: 'widget'; readonly widgetId: WidgetId }
	| { readonly kind: 'search' };

export const SEARCH_TAB_ID = 'search';
export interface WorkbenchUrlState {
	readonly focusedNoteId: TabId;
	readonly openTabs: readonly TabId[];
	/** Optional second pane rendered alongside the focused pane. */
	readonly splitNoteId?: TabId;
}

export interface WorkbenchSnapshot {
	readonly openTabs: readonly TabId[];
	readonly focusedTabId: TabId | undefined;
	readonly interactionFocusedTabId: TabId | undefined;
	readonly pinnedTabs: readonly TabId[];
	readonly recentlyUsed: readonly TabId[];
	readonly stripHidden: boolean;
	readonly splitTabId: TabId | undefined;
	readonly splitRatio: number;
	readonly activeProjectId: ProjectId | undefined;
}
export interface WorkbenchView extends WorkbenchSnapshot {
	readonly focusedNoteId: NoteId | undefined;
	readonly interactionFocusedNoteId: NoteId | undefined;
	readonly splitNoteId: NoteId | undefined;
	readonly activeNoteId: NoteId | undefined;
	readonly isWorkbenchPath: boolean;
	readonly splitActive: boolean;
}
