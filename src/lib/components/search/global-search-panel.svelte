<script lang="ts">
	import type { NoteTextMatch } from '$lib/models/notes';
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
		FtExternal as ExternalLink
	} from '$lib/components/icons';
	import { globalSearch } from '$lib/stores/search/global-search.svelte';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';

	let {
		projects = [],
		onMoveToCanvas
	}: {
		projects?: readonly Project[];
		/** Offered by the right panel only; in the workbench the search is already on the canvas. */
		onMoveToCanvas?: () => void;
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
	const replacing = $derived(globalSearch.replaceOpen && globalSearch.hits.length > 0);

	const pickProject = (value: string): void => {
		globalSearch.projectId = value === 'all' ? undefined : (value as ProjectId);
		void globalSearch.search();
	};
</script>

<div class="flex h-full min-h-0 flex-col gap-3">
	<div class="flex flex-col gap-2">
		<div class="flex items-start gap-1">
			<Tip text={globalSearch.replaceOpen ? 'Hide replace' : 'Show replace'}>
				{#snippet children({ props })}
					<Button
						{...props}
						variant="ghost"
						size="icon-sm"
						class="mt-0.5 shrink-0"
						aria-label={globalSearch.replaceOpen ? 'Hide replace' : 'Show replace'}
						aria-expanded={globalSearch.replaceOpen}
						onclick={() => (globalSearch.replaceOpen = !globalSearch.replaceOpen)}
					>
						{#if globalSearch.replaceOpen}
							<ChevronDown data-icon />
						{:else}
							<ChevronRight data-icon />
						{/if}
					</Button>
				{/snippet}
			</Tip>
			<div class="relative min-w-0 flex-1">
				<Input
					value={globalSearch.query}
					placeholder="Search all notes"
					aria-label="Search all notes"
					class="pr-14"
					oninput={(event) => {
						globalSearch.query = event.currentTarget.value;
						globalSearch.scheduleSearch();
					}}
					onkeydown={(event) => {
						if (event.key === 'Enter') void globalSearch.search();
					}}
				/>
				<div class="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-0.5">
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
		</div>
		{#if globalSearch.replaceOpen}
			<div class="flex items-center gap-1 pl-7">
				<Input
					value={globalSearch.replacement}
					placeholder="Replace"
					aria-label="Replace with"
					class="min-w-0 flex-1"
					oninput={(event) => (globalSearch.replacement = event.currentTarget.value)}
				/>
				<Button
					variant="outline"
					size="sm"
					disabled={!replacing}
					onclick={() => void globalSearch.replaceAll()}
				>
					Replace all
				</Button>
			</div>
		{/if}
		<div class="flex items-center gap-2 pl-7">
			<Select.Root type="single" value={projectFilter} onValueChange={pickProject}>
				<Select.Trigger size="sm" aria-label="Filter by project" class="max-w-48">
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
							class="ml-auto"
							aria-label="Open search in workbench"
							onclick={onMoveToCanvas}
						>
							<ExternalLink data-icon />
						</Button>
					{/snippet}
				</Tip>
			{/if}
		</div>
	</div>

	{#if globalSearch.searchError}
		<p class="pl-7 text-xs text-destructive" role="alert">{globalSearch.searchError}</p>
	{:else if globalSearch.lastReplace}
		<p class="pl-7 text-xs text-muted-foreground" role="status">
			Replaced {globalSearch.lastReplace.replacedMatches}
			{globalSearch.lastReplace.replacedMatches === 1 ? 'match' : 'matches'} in
			{globalSearch.lastReplace.replacedNotes}
			{globalSearch.lastReplace.replacedNotes === 1 ? 'note' : 'notes'}
		</p>
	{/if}

	<div class="min-h-0 flex-1 overflow-y-auto">
		{#if globalSearch.searching}
			<div class="flex items-center gap-2 pl-7 text-xs text-muted-foreground">
				<Spinner class="size-3.5" /> Searching…
			</div>
		{:else if globalSearch.query === ''}
			<p class="pl-7 text-xs text-muted-foreground">
				Search across every note's title and text. Toggle <span class="font-mono">.*</span> for regex.
			</p>
		{:else if globalSearch.hits.length === 0}
			<p class="pl-7 text-xs text-muted-foreground">No results for “{globalSearch.query}”.</p>
		{:else}
			<p class="pl-7 text-xs text-muted-foreground">
				{globalSearch.totalMatches}
				{globalSearch.totalMatches === 1 ? 'result' : 'results'} in
				{globalSearch.hits.length}
				{globalSearch.hits.length === 1 ? 'note' : 'notes'}
			</p>
			<ul class="mt-1 flex flex-col">
				{#each globalSearch.hits as hit (hit.noteId)}
					{@const collapsed = globalSearch.collapsedNoteIds.has(hit.noteId)}
					{@const count = hit.titleMatches.length + hit.matches.length}
					<li>
						<div class="row-quiet flex items-center gap-1 rounded-md px-2 py-1">
							<Button
								variant="ghost"
								class="h-auto min-w-0 flex-1 items-center justify-start gap-1.5 rounded-none px-0 py-0 text-left hover:bg-transparent hover:text-current"
								aria-expanded={!collapsed}
								onclick={() => globalSearch.toggleCollapsed(hit.noteId)}
							>
								{#if collapsed}
									<ChevronRight data-icon class="shrink-0 text-muted-foreground" />
								{:else}
									<ChevronDown data-icon class="shrink-0 text-muted-foreground" />
								{/if}
								<Document data-icon class="shrink-0 text-muted-foreground" />
								<span class="truncate text-sm font-medium">
									{#each titleSegments(hit.title, hit.titleMatches) as segment, index (index)}
										{#if segment.hit}<mark class="search-hit">{segment.text}</mark
											>{:else}{segment.text}{/if}
									{/each}
								</span>
							</Button>
							{#if globalSearch.replaceOpen && hit.matches.length > 0}
								<Tip text="Replace in this note">
									{#snippet children({ props })}
										<Button
											{...props}
											variant="ghost"
											size="sm"
											class="h-6 px-1.5 text-xs"
											aria-label="Replace in {hit.title}"
											onclick={() => void globalSearch.replaceInNote(hit.noteId)}
										>
											Replace
										</Button>
									{/snippet}
								</Tip>
							{/if}
							<span
								class="shrink-0 rounded-full bg-accent px-1.5 text-xs text-muted-foreground tabular-nums"
							>
								{count}
							</span>
						</div>
						{#if !collapsed}
							<ul>
								{#each hit.matches as match (match.start)}
									<li>
										<Button
											variant="ghost"
											class="row-interactive block h-auto w-full truncate justify-start rounded-md py-1 pr-2 pl-9 text-left text-xs font-normal text-muted-foreground hover:bg-accent hover:text-current"
											onclick={() => void workbench.openTab(hit.noteId)}
										>
											{inline(match.snippet.before)}<mark class="search-hit"
												>{inline(match.snippet.hit)}</mark
											>{inline(match.snippet.after)}
										</Button>
									</li>
								{/each}
							</ul>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
