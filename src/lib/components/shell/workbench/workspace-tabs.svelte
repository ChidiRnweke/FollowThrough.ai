<script lang="ts">
	import type { ProjectId } from '$lib/models/projects';
	import type { ShellContext } from '$lib/models/workspace';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { Button } from '$lib/components/ui/button';
	import { Tip } from '$lib/components/ui/tooltip';
	import {
		FtClose as X,
		FtPin as Pin,
		FtChevronDown as ChevronDown,
		FtChevronUp as ChevronUp,
		FtPlus as Plus
	} from '$lib/components/icons';
	import {
		hasInternalTabDrag,
		readActiveTabDrag,
		writeTabDrag
	} from '$lib/client/workbench/tab-drag';
	import { isChatTab, noteIdOf, parseTabId, type TabId } from '$lib/stores/workbench/tab-ref';
	import { chatRegistry } from '$lib/stores/agent/registries/chat-registry.svelte';
	import { diagramRegistry } from '$lib/stores/diagrams/registries/diagram-registry.svelte';
	import type { Conversation } from '$lib/models/agent';
	import { cubicOut } from 'svelte/easing';
	import { PrefersReducedMotion } from '$lib/hooks/prefers-reduced-motion.svelte';

	let {
		shell,
		sessions,
		hidden = false,
		oncreateNote,
		ontoggleHidden
	}: {
		shell: ShellContext;
		sessions: readonly Conversation[];
		/** Collapsed state — when true, the strip shrinks to 24px. */
		hidden?: boolean;
		/** One-click note creation (matches the sidebar's `+` affordance). */
		oncreateNote?: () => void;
		/** Toggle the strip's collapsed state. */
		ontoggleHidden?: () => void;
	} = $props();

	const projectOf = (tabId: TabId): ProjectId | undefined =>
		shell.noteTree.find((entry) => entry.id === noteIdOf(tabId))?.projectId;

	// Parsed once and switched on, rather than asked five yes/no questions that
	// each re-parse the id: every `isXTab`/`xIdOf` helper runs the same prefix scan
	// and uuid check, and this runs for every open tab on every recompute.
	const titleOf = (tabId: TabId): string => {
		const ref = parseTabId(tabId);
		switch (ref?.kind) {
			case 'search':
				return 'Search notes';
			case 'diagram':
				return diagramRegistry.peek(ref.diagramId)?.description?.title ?? 'Untitled diagram';
			case 'chat': {
				const conversationId = chatRegistry.peek(ref.sessionKey)?.conversationId;
				return sessions.find((entry) => entry.id === conversationId)?.title ?? 'New chat';
			}
			default:
				return shell.noteTree.find((entry) => entry.id === noteIdOf(tabId))?.title ?? 'Untitled';
		}
	};

	/** Groups are keyed by string, not `ProjectId`, so chats and search can have one too. */
	const CHATS_GROUP = 'chats';
	const SEARCH_GROUP = 'search';
	const DIAGRAMS_GROUP = 'diagrams';

	// Plain Maps: reactivity comes from `shell` and `workbench.openTabs`, and a
	// SvelteMap here would be read and written inside its own derivation.
	const groups = $derived.by(() => {
		/* eslint-disable svelte/prefer-svelte-reactivity -- rebuilt per derivation; see above */
		const projectName = new Map<ProjectId, string>();
		for (const project of shell.projects) projectName.set(project.id, project.name);
		const order: ProjectId[] = [];
		const buckets = new Map<ProjectId, TabId[]>();
		/* eslint-enable svelte/prefer-svelte-reactivity */
		const chatTabs: TabId[] = [];
		const searchTabs: TabId[] = [];
		const diagramTabs: TabId[] = [];
		for (const id of workbench.openTabs) {
			const kind = parseTabId(id)?.kind;
			if (kind === 'chat') {
				chatTabs.push(id);
				continue;
			}
			if (kind === 'search') {
				searchTabs.push(id);
				continue;
			}
			if (kind === 'diagram') {
				diagramTabs.push(id);
				continue;
			}
			const projectId = projectOf(id);
			if (!projectId) continue;
			if (!buckets.has(projectId)) {
				buckets.set(projectId, []);
				order.push(projectId);
			}
			buckets.get(projectId)!.push(id);
		}
		const projectGroups = order.map((projectId) => ({
			projectId: projectId as string,
			projectName: projectName.get(projectId) ?? 'Project',
			tabs: buckets.get(projectId) ?? []
		}));
		// Chats and search lead the strip: they belong to no project, and the old
		// group-by-project loop skipped anything without one — which is why a chat
		// tab was invisible before it had a bucket of its own.
		return [
			...(searchTabs.length > 0
				? [{ projectId: SEARCH_GROUP, projectName: 'Search', tabs: searchTabs }]
				: []),
			...(chatTabs.length > 0
				? [{ projectId: CHATS_GROUP, projectName: 'Chats', tabs: chatTabs }]
				: []),
			...(diagramTabs.length > 0
				? [{ projectId: DIAGRAMS_GROUP, projectName: 'Diagrams', tabs: diagramTabs }]
				: []),
			...projectGroups
		];
	});

	// Groups the user has folded away. Pinned tabs stay visible even inside a folded
	// group, so folding a noisy project never hides the one tab you kept.
	let folded = new SvelteSet<string>();

	function toggleFold(projectId: string): void {
		if (folded.has(projectId)) folded.delete(projectId);
		else folded.add(projectId);
	}

	function showTab(projectId: string, noteId: TabId): boolean {
		if (!folded.has(projectId)) return true;
		return workbench.isPinned(noteId);
	}

	const tabCount = $derived(workbench.openTabs.length);
	const hasTabs = $derived(tabCount > 0);
	// The focused tab persists when the user navigates to a non-workbench route
	// (Today, Todos, …) so the working set survives; the "you are here" highlight
	// must not — only mark a tab while its pane is actually rendered.
	//
	// `isWorkbenchPath` rather than a list of path prefixes: it is the same
	// predicate that decides whether these tabs have panes at all, so the strip
	// cannot fall behind a new host the way the old list had — `/diagrams/*` was
	// missing from it, and on a studio URL nothing in the strip was marked at all.
	const onWorkbenchRoute = $derived(workbench.isWorkbenchPath);

	let noteDragOver = $state(false);

	function onDragOver(event: DragEvent): void {
		if (!hasInternalTabDrag(event.dataTransfer)) return;
		event.preventDefault();
		noteDragOver = true;
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
	}

	function onDragLeave(event: DragEvent): void {
		if (event.currentTarget instanceof Node && event.relatedTarget instanceof Node) {
			if (event.currentTarget.contains(event.relatedTarget)) return;
		}
		noteDragOver = false;
	}

	function onDrop(event: DragEvent): void {
		if (!hasInternalTabDrag(event.dataTransfer)) return;
		event.preventDefault();
		noteDragOver = false;
		const tabId = readActiveTabDrag(event.dataTransfer, shell.noteTree, workbench.openTabs);
		if (!tabId) return;
		void workbench.openTabInBackground(tabId);
	}

	// Folding a group tweens each tab's width to zero rather than swapping the run's
	// contents outright, so a fold reads as the tabs going away rather than as the strip
	// jumping to a new arrangement. The wrapper clips while it shrinks; the label inside
	// keeps its own width and slides out of view instead of reflowing character by
	// character, which is what makes it read as one panel closing.
	//
	// This is the one motion in the strip that a `@media (prefers-reduced-motion)` block
	// cannot reach. A Svelte transition writes inline styles frame by frame, so the guard
	// in `layout.css` — which only neutralises CSS transitions — never sees it. The hook
	// is the same one `chat-panel.svelte` uses for its own JS-driven motion.
	const reducedMotion = new PrefersReducedMotion();

	function horizontalPanelCollapse(node: HTMLElement) {
		const width = node.offsetWidth;

		return {
			duration: reducedMotion.current ? 0 : 300,
			easing: cubicOut,
			css: (t: number) => `width: ${t * width}px`
		};
	}
</script>

<!-- The strip is one continuous surface, and it is the only thing here that paints a
     background across the whole row. A tab that is not on screen paints *nothing*: it
     is a label sitting directly on this wash. That is the whole model, and it is worth
     stating plainly because the obvious alternative — give every tab its own tile —
     is what this replaced. With no tile there are no tile edges, so there is nothing
     for the eye to line up along the row, and the strip reads as one surface with
     text on it rather than as a fence of boxes.

     The only painted tiles are the tabs currently on screen: `brand/30` for the
     focused one, `brand/20` for a split's second, both a step deeper than this wash
     and both open at the top (see the tab's own comment). Teal still marks the live
     thing — by depth of wash now, rather than by a bar across the top.

     The wash is the project-identity `bg-brand/10` (`dark:bg-brand/15`), the same
     recipe as every other identity moment in the app. It used to be `bg-secondary`
     with the tint on the tabs instead, which is this exact relationship inverted.

     The bottom hairline is an inset shadow rather than a border because a painted tile
     sits over it and has to repaint it; `overflow-hidden` here and on the scroller
     clips anything reaching below the box, so the usual -mb-px seam tricks are out,
     and an inset shadow needs no geometry outside the 40px. -->
<!-- audit-allow: no-ad-hoc-shadow — A bottom-only hairline under the strip; ring-inset rings all four sides and a border would cost the strip geometry it doesn't have. -->
<div
	class="sticky top-0 z-30 shrink-0 overflow-hidden bg-brand/10 shadow-[inset_0_-1px_0_var(--color-border)] transition-[height] duration-(--duration-panel) ease-(--ease-standard) dark:bg-brand/15 {hidden
		? 'h-6'
		: 'h-10'}"
	role="tablist"
	tabindex="-1"
	aria-label="Open notes"
	ondragover={onDragOver}
	ondragleave={onDragLeave}
	ondrop={onDrop}
>
	{#if hidden}
		<!-- Collapsed strip: the 24px height keeps the reveal affordance visible
		     while the persistent outer container animates between endpoints. -->
		<div class="flex h-6 items-center justify-end">
			<Tip text="Show tab strip" side="bottom">
				{#snippet children({ props })}
					<Button
						variant="ghost"
						{...props}
						type="button"
						class="mr-2 mt-1 tactile flex size-7 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-accent hover:text-accent-foreground"
						aria-label="Show tab strip"
						aria-expanded={false}
						onclick={() => ontoggleHidden?.()}
					>
						<ChevronDown class="size-4" />
					</Button>
				{/snippet}
			</Tip>
		</div>
	{:else}
		<!-- Host row: the scrollable tab area and the pinned right-edge controls
		     are siblings, so the new-note, close-all, and strip-hide controls
		     never scroll away no matter how many tabs overflow the strip. -->
		<div class="relative flex h-10 items-stretch overflow-hidden">
			{#if noteDragOver}
				<div
					class="absolute inset-0 z-40 flex items-center justify-center border border-primary bg-background text-xs font-medium text-foreground"
				>
					Drop to add tab
				</div>
			{/if}
			<!-- `pr-2`, not `px-2`: the first group band is meant to be fused to the pane's
			     left edge, not floating 8px in from it. -->
			<div
				data-tab-strip-scroller
				class="flex h-10 flex-1 items-stretch gap-0 overflow-x-auto overflow-y-hidden pr-2"
			>
				{#if hasTabs}
					<!-- A group is a run of tabs headed by a label pill that folds it. The tint
					     is on the tabs themselves, not on a band behind them: a band painted the
					     same wash as its tabs gives the separators nothing to separate, and the
					     strip reads as one tinted block with text in it rather than as tabs. One
					     brand tint for every group — DESIGN_SYSTEM is explicit that project
					     identity is teal only, never per-project hues. -->
					{#each groups as group (group.projectId)}
						{@const visibleTabs = group.tabs.filter((id) => showTab(group.projectId, id))}
						<!-- No tick beside a painted tile, on either side of it: the tile's fill
						     and its rounded corner already separate it, and a rule butted against
						     that corner reads as a stray mark rather than a divider.

						     "Painted tile" means *any* tab on screen, not just the focused one — a
						     split's second tab is a tile too, and asking only about the focused one
						     left a tick jammed against the split tile's corner. Both sides matter,
						     so this is a predicate over the run rather than a question each tab
						     answers about itself. -->
						{@const isTile = (id: TabId) =>
							onWorkbenchRoute &&
							(workbench.focusedTabId === id ||
								(workbench.splitActive && workbench.splitTabId === id))}
						<div data-slot="workspace-tab-group" class="flex shrink-0 items-stretch">
							<Tip
								text={folded.has(group.projectId)
									? `Show ${group.projectName} tabs`
									: `Collapse ${group.projectName} tabs`}
								side="bottom"
							>
								{#snippet children({ props })}
									<!-- The label paints nothing, exactly like the resting tabs it heads —
									     it is text on the strip's own wash, not a chip laid over it. A
									     filled chip here would be the one tile in the row that is never
									     a tab, which is precisely the wrong thing to give a surface of
									     its own. Full height for the click target; the box is invisible
									     either way.

									     `aria-expanded:bg-muted` and `aria-expanded:text-foreground` live in
									     the ghost variant, and an expanded group sets `aria-expanded="true"`,
									     so every open group's label painted itself a neutral chip. Both are
									     neutralised on the class, where the caller's wins the merge. -->
									<Button
										variant="ghost"
										{...props}
										type="button"
										aria-expanded={!folded.has(group.projectId)}
										class="h-full shrink-0 cursor-pointer gap-1.5 rounded-none border-0 bg-transparent px-3 text-xs tracking-wide text-muted-foreground uppercase hover:translate-y-0 hover:bg-foreground/5 hover:text-foreground aria-expanded:bg-transparent aria-expanded:text-muted-foreground dark:hover:bg-foreground/10"
										onclick={() => toggleFold(group.projectId)}
									>
										<span class="truncate">{group.projectName}</span>
										{#if folded.has(group.projectId)}
											<ChevronDown class="size-3 shrink-0 opacity-70" aria-hidden="true" />
										{:else}
											<ChevronUp class="size-3 shrink-0 opacity-70" aria-hidden="true" />
										{/if}
									</Button>
								{/snippet}
							</Tip>
							<!-- Separates the label from the run it heads, and obeys the same rule as
							     the ticks between tabs: none beside a painted tile. This boundary is
							     the one place that rule has to be spelled out separately, because the
							     divider is an element of its own rather than an edge of the tab that
							     follows it — which is exactly how it came to be drawn hard against
							     the leading tile's rounded corner when the first tab in the run was
							     the open one. Nothing after it means nothing to divide either, so a
							     fully folded group drops it too.

							     Short and centred, not full height: `my-2.5` leaves a 20px rule in the
							     40px strip, the same length as the ticks between tabs (which get there
							     via `inset-block` on a pseudo-element, since they cannot use margin).
							     A rule running the full depth of the strip reads as a wall between two
							     regions; a short one reads as a tick between two items.

							     Teal-tinted rather than `--border`: the neutral hairline is tuned for
							     olive chrome on paper and all but vanishes against the brand wash on
							     both sides of it. -->
							{#if visibleTabs.length > 0 && !isTile(visibleTabs[0])}
								<div class="my-2.5 w-px shrink-0 self-stretch bg-brand/40" aria-hidden="true"></div>
							{/if}
							{#each visibleTabs as noteId, tabIndex (noteId)}
								{@const focused = onWorkbenchRoute && workbench.focusedTabId === noteId}
								<!-- Both panes of a split are on screen, so both tabs are seated. Only
							     one of them has focus, and only that one is `aria-selected`. -->
								{@const split =
									onWorkbenchRoute && workbench.splitActive && workbench.splitTabId === noteId}
								<!-- `raised` is the focused tab alone. `active` still covers both for the
							     always-visible close cross — a split's tab is on screen and says so at
							     40% — but only one tab per strip takes the pane's fill. -->
								{@const active = focused || split}
								{@const raised = focused}
								<!-- The box whose width the fold transition tweens, which is why the
								     `overflow-hidden` is back: the tab inside holds `min-w-32`, so
								     without a clip it would spill out of the shrinking wrapper instead
								     of sliding out of view. It no longer carries a radius — a run of
								     unpainted tabs has no outer corner to round, and the only radius
								     left anywhere in the strip is the on-screen tile's `rounded-t-lg`.

								     `|local` so the tabs animate when *this* group folds, and not
								     again every time an ancestor block happens to mount. -->
								<div
									class="flex shrink-0 overflow-hidden"
									data-project-tab={noteId}
									data-chat-tab={isChatTab(noteId) ? noteId : undefined}
									transition:horizontalPanelCollapse|local
								>
									<!-- Tab labels truncate at 16rem, so the tooltip is the only way to read
							     a long title. A longer delay than the default keeps it from flashing
							     while the pointer sweeps across the strip. -->
									<Tip text={titleOf(noteId)} side="bottom" delayDuration={700}>
										{#snippet children({ props })}
											<!-- Cursor only, not `tactile`: the tab holds a nested close
								     button, so hovering that would lift both and double the
								     travel. A tab is seated in the strip, not a free target.

							     `border-0` is load-bearing, and it is the *opposite* of what used to be
							     here. The Button base carries `border border-transparent` and
							     `bg-clip-padding`: a transparent border shows the trough behind it, and
							     the clip guarantees the fill can never reach past the padding box. This
							     tab once kept `border-t-2` to reserve a band for its teal cap, which
							     meant the top 2px of every tab in the strip was trough rather than tab,
							     and the cap — absolutely positioned, so resolved against the *padding*
							     box — sat below that band with background showing above it. Every edge
							     the tab paints is now an inset shadow, which needs no border to sit in.
							     Do not add one back.

							     Focus is unaffected: `focus-visible:border-ring` in the base has no
							     border left to colour, but the base's `focus-visible:ring-[3px]` is what
							     actually shows the ring.

						     A resting tab paints **nothing** — no fill, no radius. It is a label on the
						     strip's wash, and that is the whole reason the row reads as one surface
						     instead of a fence of boxes. It still takes the strip's full 40px so the
						     entire depth is clickable, the way a browser's is; an unpainted box's
						     height is invisible either way.

						     The tabs that *are* on screen are the only tiles, and `h-9 self-end` is what
						     makes them tiles: 36px bottom-aligned in a 40px strip leaves 4px of strip
						     above them. That gap is load-bearing, not padding — anchored at the baseline
						     and open at the ceiling, the tile reads as having risen out of the strip.
						     Take the gap away and it reads as a block wedged into a slot.

						     A tile covers the strip's inset bottom hairline, so it repaints it. Resting
						     tabs have no fill, so the strip's own hairline shows through them untouched;
						     only the two filled states carry `shadow-[inset_0_-1px_0_…]`, and the strip's
						     bottom edge comes out as one unbroken rule.

						     Same weight, different colour. `buttonVariants.base` already sets
						     `font-medium`, so neither state states a weight and both inherit the same
						     one; `text-foreground` against `text-muted-foreground` is the entire
						     difference. Do not bold the active tab. -->
											<!-- audit-allow: no-ad-hoc-shadow — The painted tab's bottom-only hairline; ring-inset rings all four sides. -->
											<Button
												variant="ghost"
												{...props}
												type="button"
												role="tab"
												data-slot="workspace-tab"
												data-tab-state={raised ? 'raised' : split ? 'split' : 'resting'}
												data-tab-separated={!isTile(noteId) &&
												tabIndex !== visibleTabs.length - 1 &&
												!isTile(visibleTabs[tabIndex + 1])
													? 'true'
													: undefined}
												aria-selected={focused}
												draggable="true"
												class="group relative flex min-w-32 max-w-52 shrink-0 cursor-pointer items-center gap-1 border-0 px-3.5 text-sm transition-colors hover:translate-y-0 {raised
													? 'z-10 h-9 self-end rounded-t-lg rounded-b-none bg-brand/30 text-foreground shadow-[inset_0_-1px_0_var(--color-border)] hover:bg-brand/30 dark:bg-brand/35 dark:hover:bg-brand/35'
													: split
														? 'h-9 self-end rounded-t-lg rounded-b-none bg-brand/20 text-foreground shadow-[inset_0_-1px_0_var(--color-border)] hover:bg-brand/25 dark:bg-brand/25 dark:hover:bg-brand/30'
														: 'h-full rounded-none text-muted-foreground hover:bg-foreground/5 hover:text-foreground dark:hover:bg-foreground/10'}"
												ondragstart={(event) => {
													if (event.dataTransfer) writeTabDrag(event.dataTransfer, noteId);
												}}
												onclick={() => void workbench.focusTab(noteId)}
											>
												{#if workbench.isPinned(noteId)}
													<Pin class="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
												{/if}
												<span class="min-w-0 flex-1 truncate text-left">{titleOf(noteId)}</span>
												<span
													role="button"
													tabindex={-1}
													aria-label={`Close ${titleOf(noteId)}`}
													class="tactile ml-1 hidden size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground group-hover:flex group-focus-within:flex {active
														? 'flex'
														: ''}"
													onclick={(event) => {
														event.stopPropagation();
														void workbench.closeTab(noteId);
													}}
													onkeydown={(event) => {
														if (event.key === 'Enter' || event.key === ' ') {
															event.preventDefault();
															event.stopPropagation();
															void workbench.closeTab(noteId);
														}
													}}
												>
													<X class="size-3.5" />
												</span>
											</Button>
										{/snippet}
									</Tip>
								</div>
							{/each}
						</div>
					{/each}
				{:else}
					<!-- Empty strip on non-note routes: keep the 40px height so opening
			     the first note doesn't shift the editor's vertical footprint. -->
					<span
						class="flex shrink-0 items-center px-2 text-sm text-muted-foreground"
						aria-label="No notes open"
					>
						No notes open
					</span>
				{/if}
			</div>

			<!-- Pinned right-edge controls: a sibling of the scroll area (not a
			     sticky child), so the new-note, close-all, and strip-hide controls
			     stay reachable even when the tabs overflow. The hairline separates
			     the cluster from the scrolling tabs. No background of its own — it
			     sits on the strip's wash like everything else that is not a tile,
			     the way a browser's `+` and window controls do. It used to repaint
			     the strip's surface here to cover the seam, which is only necessary
			     when the tabs scrolling past it are painted. -->
			<div
				data-tab-strip-controls
				class="flex shrink-0 items-center gap-0 border-l border-border pl-2"
			>
				{#if oncreateNote}
					<Tip text="New note" side="bottom">
						{#snippet children({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon-sm"
								class="shrink-0 self-center text-primary hover:text-primary"
								aria-label="New note"
								onclick={oncreateNote}
							>
								<Plus class="size-4" />
							</Button>
						{/snippet}
					</Tip>
					<!-- Divider between the `+` action and the strip-hide chevron so the
			     chevron reads as a strip control, not as a second action. -->
					<div class="mr-1 ml-1 h-4 w-px shrink-0 self-center bg-border" aria-hidden="true"></div>
				{/if}
				<!-- Close every open tab across all projects. Sits next to the strip
			     controls so bulk cleanup is one click from any strip state.
			     Labelled rather than icon-only: a third bare × next to every
			     tab's own × and the + says nothing about what it closes. Muted
			     at rest so it stays subordinate to the tabs, red only on hover
			     (the todo-detail-panel delete idiom), and the count states the
			     blast radius up front — which is why there's no confirm step. -->
				{#if hasTabs}
					<Tip text="Close all tabs" side="bottom">
						{#snippet children({ props })}
							<Button
								variant="ghost"
								size="xs"
								{...props}
								type="button"
								class="tactile shrink-0 self-center rounded-sm text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive"
								aria-label={`Close all ${tabCount} tabs`}
								onclick={() => void workbench.closeTabs(workbench.openTabs)}
							>
								<X class="size-3.5" />
								<span>Close all</span>
								<span class="tabular-nums opacity-70" aria-hidden="true">· {tabCount}</span>
							</Button>
						{/snippet}
					</Tip>
					<div class="mr-1 ml-1 h-4 w-px shrink-0 self-center bg-border" aria-hidden="true"></div>
				{/if}
				<!-- Edge chevron: always at the very right end of the strip so the
		     toggle is a stable click target regardless of tab count. `text-foreground`
		     keeps it visible (black in light, white in dark) rather than melting
		     into the strip's background. -->
				<Tip text="Hide tab strip" side="bottom">
					{#snippet children({ props })}
						<Button
							variant="ghost"
							{...props}
							type="button"
							class="tactile flex size-5 shrink-0 items-center justify-center rounded-sm text-foreground hover:bg-accent hover:text-accent-foreground"
							aria-label="Hide tab strip"
							aria-expanded={true}
							onclick={() => ontoggleHidden?.()}
						>
							<ChevronUp class="size-3.5" />
						</Button>
					{/snippet}
				</Tip>
			</div>
		</div>
	{/if}
</div>
