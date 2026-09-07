<script lang="ts">
	import { onMount } from 'svelte';
	import type { NoteSearchContentMatch, NoteSearchHit, NoteTextMatch } from '$lib/models/notes';
	import type { Project, ProjectId } from '$lib/models/projects';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Toggle } from '$lib/components/ui/toggle';
	import { Tip } from '$lib/components/ui/tooltip';
	import {
		FtChevronDown as ChevronDown,
		FtChevronRight as ChevronRight,
		FtDocument as Document,
		FtExternal as ExternalLink,
		FtSearch as Search
	} from '$lib/components/icons';
	import ConfirmDelete from '$lib/components/shared/confirm-delete.svelte';
	import EmptyState from '$lib/components/shared/empty-state.svelte';
	import { globalSearch } from '$lib/stores/search/global-search.svelte';
	import { noteReveal } from '$lib/stores/notes/note-reveal.svelte';
	import { rightPanel } from '$lib/stores/shell/right-panel.svelte';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';

	let {
		projects = [],
		onMoveToCanvas,
		onOpenMatch
	}: {
		projects?: readonly Project[];
		/** Offered by the right panel only; in the workbench the search is already on the canvas. */
		onMoveToCanvas?: () => void;
		/** Override for the snippet click-through; defaults to revealing the match in the workbench. */
		onOpenMatch?: (hit: NoteSearchHit, match: NoteSearchContentMatch) => void;
	} = $props();

	interface TitleSegment {
		readonly text: string;
		readonly hit: boolean;
	}

	const titleSegments = (
		title: string,
		matches: readonly NoteTextMatch[]
	): readonly TitleSegment[] => {
		const segments: TitleSegment[] = [];
		let cursor = 0;
		for (const match of matches) {
			if (match.start > cursor)
				segments.push({ text: title.slice(cursor, match.start), hit: false });
			segments.push({ text: title.slice(match.start, match.end), hit: true });
			cursor = match.end;
		}
		if (cursor < title.length) segments.push({ text: title.slice(cursor), hit: false });
		return segments;
	};

	// Snippets are single-row: a note's block separator would break the row's one-line
	// contract, so newlines flatten to a space, matching how VS Code renders its hits.
	const inline = (text: string): string => text.replace(/\n+/g, ' ');

	const projectFilter = $derived(globalSearch.projectId ?? 'all');
	const replacing = $derived(globalSearch.hits.length > 0);
	const replaceTitle = $derived(
		`Replace ${globalSearch.totalMatches} ${globalSearch.totalMatches === 1 ? 'match' : 'matches'} across ${globalSearch.hits.length} ${globalSearch.hits.length === 1 ? 'note' : 'notes'}?`
	);

	const pickProject = (value: string): void => {
		globalSearch.projectId = value === 'all' ? undefined : (value as ProjectId);
		void globalSearch.search();
	};

	/**
	 * A result click is a promise: land in the note with the clicked match selected, scrolled
	 * to and lit — and every other match in the note lit alongside it. The reveal rides a
	 * one-shot store rather than the URL — it is a transient intent, and `workbench.openTab`
	 * owns the shareable state.
	 */
	const openMatch = (hit: NoteSearchHit, match: NoteSearchContentMatch): void => {
		noteReveal.request({
			noteId: hit.noteId,
			start: match.start,
			end: match.end,
			text: match.text,
			others: hit.matches.filter((other) => other !== match)
		});
		void workbench.openTab(hit.noteId);
	};
	const handleOpenMatch = $derived(onOpenMatch ?? openMatch);

	// ⌘⇧F lands here: the command opens the panel, then asks for the input.
	// `$state` — not a plain `let`: the `bind:ref` hands the element over through
	// it, and without reactivity the hand-off is dropped (`non_reactive_update`).
	let searchInput = $state<HTMLInputElement | undefined>();
	onMount(() => rightPanel.registerSearchInputFocus(() => searchInput?.focus()));
</script>

<div class="flex h-full min-h-0 flex-col gap-6">
	<!--
		Search and replace are separate groups, and the 24px ladder step between them says
		so (DESIGN_SYSTEM: 8px inside a group, 24px between groups). Replace stays visible —
		one compact row is not worth hiding behind a toggle.
	-->
	<div class="flex items-center gap-1">
		<div class="relative min-w-0 flex-1">
			<Input
				bind:ref={searchInput}
				value={globalSearch.query}
				placeholder="Search all notes"
				aria-label="Search all notes"
				class="h-11 pr-14 sm:h-8"
				oninput={(event) => {
					globalSearch.query = event.currentTarget.value;
					globalSearch.scheduleSearch();
				}}
				onkeydown={(event) => {
					if (event.key === 'Enter') void globalSearch.search();
				}}
			/>
			<div class="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-0.5">
				<!-- audit-allow: no-raw-font-family — The toggle label is the literal search symbol Aa. -->
				<Toggle
					size="sm"
					class="h-6 min-w-6 rounded px-1 font-mono text-xs aria-pressed:bg-accent aria-pressed:text-primary"
					pressed={globalSearch.caseSensitive}
					onPressedChange={(pressed) => {
						globalSearch.caseSensitive = pressed;
						globalSearch.scheduleSearch();
					}}
					aria-label="Match case"
				>
					Aa
				</Toggle>
				<!-- audit-allow: no-raw-font-family — The toggle label is the literal regex symbol .*. -->
				<Toggle
					size="sm"
					class="h-6 min-w-6 rounded px-1 font-mono text-xs aria-pressed:bg-accent aria-pressed:text-primary"
					pressed={globalSearch.regex}
					onPressedChange={(pressed) => {
						globalSearch.regex = pressed;
						globalSearch.scheduleSearch();
					}}
					aria-label="Use regular expression"
				>
					.*
				</Toggle>
			</div>
		</div>
		<Select.Root type="single" value={projectFilter} onValueChange={pickProject}>
			<Select.Trigger
				size="sm"
				aria-label="Filter by project"
				class="h-11 w-auto min-w-0 sm:h-8 sm:w-44"
			>
				{projectFilter === 'all'
					? 'All projects'
					: (projects.find((project) => project.id === projectFilter)?.name ?? 'Project')}
			</Select.Trigger>
			<Select.Content>
				<Select.Group>
					<Select.Item value="all">All projects</Select.Item>
					{#each projects as project (project.id)}
						<Select.Item value={project.id}>{project.name}</Select.Item>
					{/each}
				</Select.Group>
			</Select.Content>
		</Select.Root>
		{#if onMoveToCanvas}
			<Tip text="Open in workbench">
				{#snippet children({ props })}
					<Button
						{...props}
						variant="ghost"
						size="icon-sm"
						class="shrink-0"
						aria-label="Open search in workbench"
						onclick={onMoveToCanvas}
					>
						<ExternalLink data-icon />
					</Button>
				{/snippet}
			</Tip>
		{/if}
	</div>
	<div class="flex flex-col gap-2">
		<div class="flex items-center gap-1">
			<Input
				value={globalSearch.replacement}
				placeholder="Replace with..."
				aria-label="Replace with"
				class="h-11 min-w-0 flex-1 sm:h-8"
				oninput={(event) => (globalSearch.replacement = event.currentTarget.value)}
			/>
			<ConfirmDelete
				title={replaceTitle}
				description="This rewrites every match in the note bodies. Title matches are left alone."
				confirmLabel="Replace all"
				confirmVariant="default"
				onconfirm={() => globalSearch.replaceAll()}
			>
				{#snippet trigger(props)}
					<Button {...props} size="sm" class="h-11 shrink-0 sm:h-8" disabled={!replacing}>
						Replace all
					</Button>
				{/snippet}
			</ConfirmDelete>
		</div>
		{#if globalSearch.searchError}
			<p class="text-xs text-destructive" role="alert">{globalSearch.searchError}</p>
		{:else if globalSearch.lastReplace}
			<p class="text-xs text-muted-foreground" role="status">
				Replaced {globalSearch.lastReplace.replacedMatches}
				{globalSearch.lastReplace.replacedMatches === 1 ? 'match' : 'matches'} in
				{globalSearch.lastReplace.replacedNotes}
				{globalSearch.lastReplace.replacedNotes === 1 ? 'note' : 'notes'}
			</p>
		{/if}
	</div>

	<!-- Results are a different kind of content than the controls, so they sit one
		     ladder step past the group gap (32px, not 24px). -->
	<div class="mt-2 min-h-0 flex-1 overflow-y-auto">
		{#if globalSearch.query === ''}
			<EmptyState
				icon={Search}
				title="Search every note's title and text."
				hint="Toggle .* for regex."
				size="large"
				label="Search"
			/>
		{:else if globalSearch.hits.length === 0 && globalSearch.searching}
			<div class="flex items-center gap-2 text-xs text-muted-foreground">
				<Spinner class="size-3.5" /> Searching…
			</div>
		{:else if globalSearch.hits.length === 0}
			<EmptyState
				icon={Search}
				title="No results for “{globalSearch.query}”."
				size="large"
				label="No results"
			/>
		{:else}
			<!-- The count row doubles as the in-flight status: while a refinement is running
			     the results stay on screen, dimmed, and the line becomes a spinner — a search
			     never blinks the list away and then paints it back. -->
			<p class="text-xs text-muted-foreground" role="status">
				{#if globalSearch.searching}
					<span class="flex items-center gap-2">
						<Spinner class="size-3.5" /> Searching…
					</span>
				{:else}
					{globalSearch.totalMatches}
					{globalSearch.totalMatches === 1 ? 'result' : 'results'} in
					{globalSearch.hits.length}
					{globalSearch.hits.length === 1 ? 'note' : 'notes'}
				{/if}
			</p>
			<!-- The dim lives on a wrapper so its micro-duration transition and the list's
			     200ms entrance animation don't fight over one duration property. -->
			<div
				class="transition-opacity duration-(--duration-micro) {globalSearch.searching
					? 'opacity-50'
					: 'opacity-100'}"
			>
				{#key globalSearch.hits}
					<!-- New results arrive as a 4px rise and fade at the disclosure budget; CSS,
					     so the reduced-motion guard collapses it to 1ms. -->
					<!-- The gap between documents is the grouping signal: clearly wider than the
					     snippet spacing inside one document, no dividers. -->
					<ul
						class="animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-(--ease-standard) mt-1 flex flex-col gap-3"
					>
						{#each globalSearch.hits as hit (hit.noteId)}
							{@const collapsed = globalSearch.collapsedNoteIds.has(hit.noteId)}
							{@const count = hit.titleMatches.length + hit.matches.length}
							<li>
								<div class="row-quiet flex items-center gap-1 rounded-md px-2 py-1">
									<Button
										variant="ghost"
										size="icon-xs"
										class="shrink-0 text-muted-foreground"
										aria-label={collapsed ? 'Expand matches' : 'Collapse matches'}
										aria-expanded={!collapsed}
										onclick={() => globalSearch.toggleCollapsed(hit.noteId)}
									>
										{#if collapsed}
											<ChevronRight data-icon />
										{:else}
											<ChevronDown data-icon />
										{/if}
									</Button>
									<!-- The title jumps to the first match; the chevron collapses. One gesture
							     each, so a click on the document never reads as ambiguous. -->
									<Button
										variant="ghost"
										class="h-auto min-w-0 items-center justify-start gap-1.5 rounded-none px-0 py-0 text-left hover:bg-transparent hover:text-current"
										onclick={() => {
											const first = hit.matches[0];
											if (first) handleOpenMatch(hit, first);
											else void workbench.openTab(hit.noteId);
										}}
									>
										<Document data-icon class="shrink-0 text-muted-foreground" />
										<span class="truncate text-sm font-medium">
											{#each titleSegments(hit.title, hit.titleMatches) as segment, index (index)}
												{#if segment.hit}<mark class="search-hit">{segment.text}</mark
													>{:else}{segment.text}{/if}
											{/each}
										</span>
									</Button>
									<span
										class="shrink-0 rounded-full bg-accent px-1.5 text-xs text-muted-foreground tabular-nums"
									>
										{count}
										{count === 1 ? 'match' : 'matches'}
									</span>
									{#if hit.matches.length > 0}
										<Tip text="Replace in this note">
											{#snippet children({ props })}
												<Button
													{...props}
													variant="ghost"
													size="sm"
													class="ml-auto h-6 shrink-0 px-1.5 text-xs"
													aria-label="Replace in {hit.title}"
													onclick={() => void globalSearch.replaceInNote(hit.noteId)}
												>
													Replace
												</Button>
											{/snippet}
										</Tip>
									{/if}
								</div>
								{#if !collapsed}
									<ul>
										{#each hit.matches as match (match.start)}
											<li>
												<Button
													variant="ghost"
													class="row-interactive block h-auto w-full truncate justify-start rounded-md py-1 pr-2 pl-9 text-left text-xs font-normal text-muted-foreground hover:bg-accent hover:text-current"
													onclick={() => handleOpenMatch(hit, match)}
												>
													<!-- Ellipses only where the window was actually cut — a match at
											     the end of a note gets no fake trailing "…". -->
													{#if match.snippet.truncatedBefore}…{/if}{inline(
														match.snippet.before
													)}<mark class="search-hit">{inline(match.snippet.hit)}</mark>{inline(
														match.snippet.after
													)}{#if match.snippet.truncatedAfter}…{/if}
												</Button>
											</li>
										{/each}
									</ul>
								{/if}
							</li>
						{/each}
					</ul>
				{/key}
			</div>
		{/if}
	</div>
</div>
