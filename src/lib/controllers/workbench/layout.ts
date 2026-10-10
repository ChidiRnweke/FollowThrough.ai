import type { ProjectId } from '$lib/models/projects';
import type { TabId, WorkbenchLayoutRecord, WorkbenchUrlState } from '$lib/models/workbench';
import type { WorkbenchState } from '$lib/stores/workbench/state.svelte';
import type { WorkbenchLifecycleState } from '$lib/stores/workbench/lifecycle';
import type {
	WorkbenchLayoutController,
	WorkbenchLayoutLifecycle,
	WorkbenchNavigationEffects,
	WorkbenchRouter,
	WorkbenchStorage,
	WorkbenchConversations,
	WorkbenchPreferences,
	WorkbenchUrlCodec,
	WorkbenchTabReader
} from './contracts';
export class WorkbenchLayout
	implements WorkbenchLayoutController, WorkbenchLayoutLifecycle, WorkbenchNavigationEffects
{
	constructor(
		private readonly state: WorkbenchState,
		private readonly lifecycle: WorkbenchLifecycleState,
		private readonly router: WorkbenchRouter,
		private readonly storage: WorkbenchStorage,
		private readonly preferences: WorkbenchPreferences,
		private readonly codec: WorkbenchUrlCodec,
		private readonly tabs: WorkbenchTabReader
	) {}
	attach(accountId: string, conversations: WorkbenchConversations): () => void {
		this.detach();
		this.lifecycle.binding = { repository: this.storage.open(accountId), conversations };
		const generation = this.lifecycle.generation;
		return () => {
			if (this.lifecycle.generation === generation) this.detach();
		};
	}
	private detach(): void {
		this.lifecycle.generation++;
		this.lifecycle.binding?.repository.close();
		this.lifecycle.binding = undefined;
		this.lifecycle.hydrated = false;
		this.state.update({
			openTabs: [],
			focusedTabId: undefined,
			interactionFocusedTabId: undefined,
			splitTabId: undefined,
			pinnedTabs: [],
			recentlyUsed: [],
			activeProjectId: undefined
		});
		this.lifecycle.applyingFromUrl = false;
		this.lifecycle.restoring = false;
		this.lifecycle.pruning = false;
	}
	private urlFor(next: WorkbenchUrlState): string {
		const key = this.tabs.chat(next.focusedNoteId);
		const conversation = key
			? this.lifecycle.binding?.conversations.peek(key)?.conversationId
			: undefined;
		return this.codec.serialize(next, conversation);
	}
	private restorePreferences(): void {
		const preferences = this.preferences.read();
		if (preferences.stripHidden !== undefined)
			this.state.update({ stripHidden: preferences.stripHidden });
		if (preferences.splitRatio !== undefined)
			this.state.update({ splitRatio: preferences.splitRatio });
	}
	toggleStripHidden(): void {
		this.state.update({ stripHidden: !this.state.snapshot.stripHidden });
		this.preferences.writeStripHidden(this.state.snapshot.stripHidden);
		void this.persist();
	}
	setSplitRatio(ratio: number): void {
		const splitRatio = Number.isFinite(ratio) ? Math.min(0.75, Math.max(0.25, ratio)) : 0.5;
		this.state.update({ splitRatio });
		this.preferences.writeSplitRatio(splitRatio);
		void this.persist();
	}

	async hydrate(): Promise<void> {
		if (this.lifecycle.hydrated) return;
		const repository = this.lifecycle.binding?.repository;
		if (!repository) throw new Error('Connect the account before restoring workbench tabs');
		const generation = this.lifecycle.generation;
		const url = this.router.currentUrl();
		const urlState = this.codec.parse(url);
		this.lifecycle.hydrated = true;
		this.lifecycle.restoring = true;
		let saveCurrent = false;
		try {
			this.restorePreferences();
			const record = await repository.get();
			if (generation !== this.lifecycle.generation) return;
			if (this.router.currentUrl().href !== url.href) {
				// The user's newer navigation wins over a delayed device read.
				this.syncFromUrl();
				saveCurrent = true;
				return;
			}
			if (record) {
				this.state.update({ stripHidden: record.stripHidden });
				this.state.update({ splitRatio: record.splitRatio });
				this.state.update({ pinnedTabs: record.pinnedTabs });
				this.state.update({ recentlyUsed: record.recentlyUsed });
			}
			// Overview routes retain their URL; a deep link can restore its saved sibling tabs.
			if (!urlState) return;
			if (
				record?.focusedNoteId &&
				record.openTabs.includes(urlState.focusedNoteId) &&
				(urlState.openTabs.length === 1 || record.openTabs.length > urlState.openTabs.length)
			) {
				const restored: WorkbenchUrlState = {
					focusedNoteId: urlState.focusedNoteId,
					openTabs: record.openTabs,
					...(urlState.splitNoteId && record.openTabs.includes(urlState.splitNoteId)
						? { splitNoteId: urlState.splitNoteId }
						: {})
				};
				await this.router.goto(this.urlFor(restored), { replaceState: true, noScroll: true });
				if (generation !== this.lifecycle.generation) return;
			}
			this.syncFromUrl();
			saveCurrent = true;
			// audit-allow: silent-catch — restoration failure is shown to the user; URL state remains usable and the unreadable stored record is not overwritten.
		} catch (error) {
			if (generation !== this.lifecycle.generation) return;
			this.preferences.report(
				error instanceof Error ? error : new Error('Workspace tabs could not be restored')
			);
			this.syncFromUrl();
		} finally {
			if (generation === this.lifecycle.generation) {
				this.lifecycle.restoring = false;
				if (saveCurrent) await this.persist();
			}
		}
	}

	syncFromUrl(): void {
		if (!this.lifecycle.binding?.repository) return;
		if (this.lifecycle.applyingFromUrl) return;
		const url = this.router.currentUrl();
		const urlState = this.codec.parse(url);
		if (!urlState) {
			// Navigated away from `/notes/*` — leave the in-memory state alone;
			// the layout is going to render the standard outlet instead.
			return;
		}
		this.applyUrlState(urlState);
	}

	private applyUrlState(urlState: WorkbenchUrlState): void {
		if (
			this.state.snapshot.focusedTabId === urlState.focusedNoteId &&
			this.state.snapshot.openTabs.length === urlState.openTabs.length &&
			this.state.snapshot.openTabs.every((id, i) => id === urlState.openTabs[i]) &&
			this.state.snapshot.splitTabId === urlState.splitNoteId
		)
			return;
		this.lifecycle.applyingFromUrl = true;
		this.state.update({ openTabs: urlState.openTabs });
		this.state.update({ focusedTabId: urlState.focusedNoteId });
		this.state.update({ splitTabId: urlState.splitNoteId });
		if (
			this.state.snapshot.interactionFocusedTabId !== urlState.focusedNoteId &&
			this.state.snapshot.interactionFocusedTabId !== urlState.splitNoteId
		)
			this.state.update({ interactionFocusedTabId: urlState.focusedNoteId });
		// Only rebuild the MRU list when the focused tab isn't already at its head:
		// the layout's `$effect` reads `recentlyUsed` (via `pruneClosedNotes`) and
		// writes it here, so an unconditional new array is an effect feeding itself.
		if (this.state.snapshot.recentlyUsed[0] !== urlState.focusedNoteId)
			this.state.update({
				recentlyUsed: [
					urlState.focusedNoteId,
					...this.state.snapshot.recentlyUsed.filter((id) => id !== urlState.focusedNoteId)
				].slice(0, 16)
			});
		this.lifecycle.applyingFromUrl = false;
		void this.persist();
	}

	refreshActiveProjectId(projectOfTab: (tabId: TabId) => ProjectId | undefined): void {
		const tabId = this.state.snapshot.focusedTabId;
		this.state.update({ activeProjectId: tabId ? projectOfTab(tabId) : undefined });
	}

	togglePin(noteId: TabId): void {
		if (this.state.snapshot.pinnedTabs.includes(noteId)) {
			this.state.update({
				pinnedTabs: this.state.snapshot.pinnedTabs.filter((id) => id !== noteId)
			});
		} else {
			this.state.update({ pinnedTabs: [...this.state.snapshot.pinnedTabs, noteId] });
		}
		void this.persist();
	}

	async clearToOverview(
		persistPatch: Pick<WorkbenchLayoutRecord, 'pinnedTabs' | 'recentlyUsed'>
	): Promise<void> {
		const generation = this.lifecycle.generation;
		this.lifecycle.applyingFromUrl = true;
		this.state.update({ openTabs: [] });
		this.state.update({ focusedTabId: undefined });
		this.state.update({ splitTabId: undefined });
		try {
			await this.persist({ openTabs: [], focusedNoteId: null, ...persistPatch });
			if (generation !== this.lifecycle.generation) return;
			await this.router.goto('/today', { replaceState: false });
		} finally {
			if (generation === this.lifecycle.generation) this.lifecycle.applyingFromUrl = false;
		}
	}

	async navigate(next: WorkbenchUrlState, options: { replace: boolean }): Promise<void> {
		const generation = this.lifecycle.generation;
		const url = this.urlFor(next);
		await this.router.goto(url, { replaceState: options.replace, noScroll: true });
		if (generation !== this.lifecycle.generation) return;
		this.syncFromUrl();
		// Reconcile before the durable write even when the shell effect has not run yet.
		await this.persist();
	}

	async persist(override?: Partial<WorkbenchLayoutRecord>): Promise<void> {
		if (this.lifecycle.restoring) return;
		const repository = this.lifecycle.binding?.repository;
		if (!repository) throw new Error('Connect the account before saving workbench tabs');
		const generation = this.lifecycle.generation;
		const record: WorkbenchLayoutRecord = {
			id: 'current',
			openTabs: override?.openTabs ?? this.state.snapshot.openTabs,
			focusedNoteId: override?.focusedNoteId ?? this.state.snapshot.focusedTabId ?? null,
			pinnedTabs: override?.pinnedTabs ?? this.state.snapshot.pinnedTabs,
			recentlyUsed: override?.recentlyUsed ?? this.state.snapshot.recentlyUsed,
			stripHidden: override?.stripHidden ?? this.state.snapshot.stripHidden,
			splitRatio: override?.splitRatio ?? this.state.snapshot.splitRatio
		};
		try {
			await repository.put(record);
			// audit-allow: silent-catch — persistence failure is reported while the live workspace remains intact.
		} catch (error) {
			if (generation !== this.lifecycle.generation) return;
			this.preferences.report(
				error instanceof Error ? error : new Error('Workspace state could not be saved')
			);
		}
	}
}
