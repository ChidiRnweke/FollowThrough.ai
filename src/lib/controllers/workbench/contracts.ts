import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type {
	TabId,
	TabRef,
	WorkbenchLayoutRecord,
	WorkbenchUrlState
} from '$lib/models/workbench';
export interface WorkbenchRouter {
	goto(url: string, options?: { replaceState?: boolean; noScroll?: boolean }): Promise<void>;
	currentUrl(): URL;
}
export interface WorkbenchLayoutRepository {
	get(): Promise<WorkbenchLayoutRecord | undefined>;
	put(record: WorkbenchLayoutRecord): Promise<void>;
	close(): void;
}
export interface WorkbenchStorage {
	open(accountId: string): WorkbenchLayoutRepository;
}
export interface WorkbenchConversations {
	peek(key: string): { readonly conversationId: string | undefined } | undefined;
}
export interface WorkbenchPreferences {
	read(): { readonly stripHidden: boolean | undefined; readonly splitRatio: number | undefined };
	writeStripHidden(value: boolean): void;
	writeSplitRatio(value: number): void;
	report(error: Error): void;
}
export interface WorkbenchUrlCodec {
	parse(url: URL): WorkbenchUrlState | undefined;
	serialize(state: WorkbenchUrlState, conversationId: string | undefined): string;
}
export interface WorkbenchTabReader {
	ref(id: TabId): TabRef | undefined;
	note(id: TabId): NoteId | undefined;
	chat(id: TabId): string | undefined;
}
export interface WorkbenchLayoutLifecycle {
	attach(accountId: string, conversations: WorkbenchConversations): () => void;
	hydrate(): Promise<void>;
	syncFromUrl(): void;
	refreshActiveProjectId(projectOfTab: (id: TabId) => ProjectId | undefined): void;
}
export interface WorkbenchLayoutController {
	togglePin(id: TabId): void;
	toggleStripHidden(): void;
	setSplitRatio(ratio: number): void;
}
/** Controller-to-controller coordination; never exposed by the composition root. */
export interface WorkbenchNavigationEffects {
	navigate(next: WorkbenchUrlState, options: { replace: boolean }): Promise<void>;
	persist(override?: Partial<WorkbenchLayoutRecord>): Promise<void>;
	clearToOverview(patch: Pick<WorkbenchLayoutRecord, 'pinnedTabs' | 'recentlyUsed'>): Promise<void>;
}
export interface WorkbenchNavigationController {
	openTab(id: TabId): Promise<void>;
	openSplit(id: TabId, split: TabId): Promise<void>;
	openTabInBackground(id: TabId): Promise<void>;
	focusTab(id: TabId): Promise<void>;
	closeTab(id: TabId): Promise<void>;
	closeTabs(ids: readonly TabId[]): Promise<void>;
	moveTab(from: TabId, to: TabId): Promise<void>;
	replaceTab(from: TabId, to: TabId): Promise<void>;
	setSplit(id: TabId | undefined): Promise<void>;
	setInteractionFocus(id: TabId): void;
}
export interface WorkbenchPruning {
	pruneClosedNotes(known: ReadonlySet<NoteId>): Promise<void>;
}
