<script lang="ts">
	import type { ProjectId } from '$lib/models/projects';
	import type { ToolClassification, ToolPreference } from '$lib/models/agent';
	import { toast } from 'svelte-sonner';
	import {
		listToolPreferences,
		resetToolOverride,
		setToolEnabled
	} from '$lib/remote/settings/settings.remote';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Pagination from '$lib/components/ui/pagination';
	import * as Select from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';

	let {
		projects,
		projectId,
		onscopechange
	}: {
		projects: readonly { id: ProjectId; name: string }[];
		projectId: ProjectId | undefined;
		onscopechange: (projectId: string) => void;
	} = $props();

	const ALL_PROJECTS = 'all';
	const PAGE_SIZE = 15;

	type KindFilter = 'all' | ToolClassification;
	type StateFilter = 'all' | 'on' | 'off';

	let search = $state('');
	let kind = $state<KindFilter>('all');
	let availability = $state<StateFilter>('all');
	let page = $state(1);
	let busy = $state<string | null>(null);

	const scope = $derived(projectId ? { projectId } : {});
	const scopeName = $derived(projects.find((project) => project.id === projectId)?.name);

	/**
	 * Read tools outnumber the rest two to one, so the classification is both a
	 * filter and the sort order: the tools worth thinking about turning off come
	 * first, and narrowing to one kind is a click.
	 */
	const groups: readonly { classification: ToolClassification; title: string }[] = [
		{ classification: 'mutation', title: 'Changes' },
		{ classification: 'proposal', title: 'Proposals' },
		{ classification: 'read', title: 'Reading' }
	];

	const rankOf = (classification: ToolClassification) =>
		groups.findIndex((group) => group.classification === classification);

	/**
	 * Every filter narrows the list, so each one resets the page: page 4 of a
	 * 62-tool list is nowhere in a 3-tool result, and landing on a blank page
	 * reads as "no matches".
	 */
	function selectKind(next: string | string[]): void {
		if (typeof next !== 'string') return;
		if (next !== 'all' && next !== 'read' && next !== 'proposal' && next !== 'mutation') return;
		kind = next;
		page = 1;
	}

	function selectAvailability(next: string | string[]): void {
		if (typeof next !== 'string') return;
		if (next !== 'all' && next !== 'on' && next !== 'off') return;
		availability = next;
		page = 1;
	}

	function searchFor(query: string): void {
		search = query;
		page = 1;
	}

	function selectScope(next: string): void {
		page = 1;
		onscopechange(next);
	}

	function matching(
		preferences: readonly ToolPreference[],
		query: string
	): readonly ToolPreference[] {
		return preferences
			.filter((preference) => kind === 'all' || preference.classification === kind)
			.filter(
				(preference) => availability === 'all' || (availability === 'on') === preference.enabled
			)
			.filter(
				(preference) =>
					query.length === 0 ||
					preference.name.toLowerCase().includes(query) ||
					preference.description.toLowerCase().includes(query)
			)
			.toSorted(
				(a, b) =>
					rankOf(a.classification) - rankOf(b.classification) || a.name.localeCompare(b.name)
			);
	}

	/**
	 * One chunk per run of same-kind tools on the current page, rather than one
	 * per group: a group can straddle a page boundary, and a page that opens
	 * mid-group still has to say which kind of tool it is showing.
	 */
	function chunksOf(
		visible: readonly ToolPreference[]
	): readonly { title: string; items: readonly ToolPreference[] }[] {
		return visible.reduce<{ title: string; items: ToolPreference[] }[]>((chunks, preference) => {
			const title = groups[rankOf(preference.classification)]!.title;
			const current = chunks.at(-1);
			if (current?.title === title) current.items.push(preference);
			else chunks.push({ title, items: [preference] });
			return chunks;
		}, []);
	}

	function readable(name: string): string {
		return name.replaceAll('_', ' ');
	}

	async function toggle(preference: ToolPreference, enabled: boolean): Promise<void> {
		busy = preference.name;
		try {
			await setToolEnabled({ ...scope, toolName: preference.name, enabled });
		} catch {
			toast.error(`Could not change ${readable(preference.name)}. Try again.`);
		} finally {
			busy = null;
		}
	}

	async function reset(preference: ToolPreference): Promise<void> {
		if (!projectId) return;
		busy = preference.name;
		try {
			await resetToolOverride({ toolName: preference.name, projectId });
			toast.success(`${readable(preference.name)} follows your default again`);
		} catch {
			toast.error(`Could not reset ${readable(preference.name)}. Try again.`);
		} finally {
			busy = null;
		}
	}
</script>

<!-- A preamble, then three groups separated by space rather than by borders: what
     you are editing, how you are filtering it, and the list itself. Gaps step 8px
     inside a group → 24px between groups → a further step below the preamble, so
     the grouping is legible without drawing a card. Density comes from the 62
     rows, never from the four controls, which keep their default height. -->
<section class="flex max-w-3xl flex-col gap-6">
	<!-- A preamble for the whole panel, not a caption on the scope control below
	     it — so it sits a step further out than the gap between the groups. -->
	<p class="pb-2 text-sm text-muted-foreground">
		Turn off anything you would rather the assistant not do. Changes write to your workspace,
		proposals wait for your review, and reading never writes. A tool you turn off disappears
		entirely — from chat, from tool search, and from any connected MCP client.
	</p>

	<div class="flex flex-col gap-2">
		<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
			<div class="flex items-center gap-2">
				<span class="text-sm text-muted-foreground">Applies to</span>
				<Select.Root type="single" value={projectId ?? ALL_PROJECTS} onValueChange={selectScope}>
					<Select.Trigger class="w-52" aria-label="Tool settings scope">
						{scopeName ?? 'All projects'}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value={ALL_PROJECTS} label="All projects">All projects</Select.Item>
						{#each projects as project (project.id)}
							<Select.Item value={project.id} label={project.name}>{project.name}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
			<!-- Its own boundary so a scope change reloads the tally without blanking
			     the controls the user is standing on. Remote queries dedupe by
			     argument, so this and the list below are one request. -->
			<svelte:boundary>
				{@const preferences = await listToolPreferences(scope)}
				<p class="provenance-caption">
					{preferences.filter((preference) => preference.enabled).length} of {preferences.length} on ·
					{preferences.filter((preference) => preference.locked).length} always on
				</p>
			</svelte:boundary>
		</div>
		{#if projectId}
			<p class="provenance-caption">
				Only <span class="font-medium text-foreground">{scopeName}</span> changes here. Anything you have
				not overridden follows your workspace default.
			</p>
		{/if}
	</div>

	<!-- The filter bar governs the list, but a control bar and the data under it
	     are different in kind, so it takes a further step — 32px, the same as the
	     preamble to the controls above. The gaps double at each level — 6px heading
	     to its rows, 12px between kinds, 32px to the bar above — so no two levels
	     read as peers. -->
	<div class="flex flex-col gap-8">
		<div class="flex flex-wrap items-center gap-2">
			<Input
				class="min-w-56 flex-1"
				value={search}
				oninput={(event) => searchFor(event.currentTarget.value)}
				placeholder="Find a tool — notes, archive, export…"
				aria-label="Find a tool"
				autocomplete="off"
			/>
			<ToggleGroup.Root
				type="single"
				variant="outline"
				value={kind}
				onValueChange={selectKind}
				aria-label="Filter by what the tool does"
			>
				<ToggleGroup.Item value="all">All</ToggleGroup.Item>
				{#each groups as group (group.classification)}
					<ToggleGroup.Item value={group.classification}>{group.title}</ToggleGroup.Item>
				{/each}
			</ToggleGroup.Root>
			<ToggleGroup.Root
				type="single"
				variant="outline"
				value={availability}
				onValueChange={selectAvailability}
				aria-label="Filter by whether the tool is enabled"
			>
				<ToggleGroup.Item value="all">Any</ToggleGroup.Item>
				<ToggleGroup.Item value="on">On</ToggleGroup.Item>
				<ToggleGroup.Item value="off">Off</ToggleGroup.Item>
			</ToggleGroup.Root>
		</div>

		<svelte:boundary>
			{#snippet pending()}
				<p class="text-sm text-muted-foreground">Loading tools…</p>
			{/snippet}
			{@const preferences = await listToolPreferences(scope)}
			{@const filtered = matching(preferences, search.trim().toLowerCase())}
			{@const start = (page - 1) * PAGE_SIZE}
			{@const visible = filtered.slice(start, start + PAGE_SIZE)}

			{#if filtered.length === 0}
				<p class="text-sm text-muted-foreground">No tool matches these filters.</p>
			{:else}
				<div class="flex flex-col gap-3">
					{#each chunksOf(visible) as chunk (chunk.title)}
						<div class="flex flex-col gap-1.5">
							<h3 class="eyebrow">{chunk.title}</h3>
							<!-- Bled 12px past the measure so names align with the controls above
							     while the hairlines still read as one continuous list. -->
							<ul class="-mx-3 divide-y divide-border border-t border-border">
								{#each chunk.items as preference (preference.name)}
									<li class="flex items-center gap-3 px-3 py-2">
										<div
											class={[
												'flex min-w-0 flex-1 items-baseline gap-3',
												!preference.enabled && 'opacity-60'
											]}
										>
											<span class="shrink-0 font-mono text-sm">{preference.name}</span>
											<span
												class="truncate text-sm text-muted-foreground"
												title={preference.description}
											>
												{preference.description}
											</span>
										</div>
										{#if preference.locked}
											<Badge variant="secondary" class="shrink-0">Always on</Badge>
										{:else if preference.source === 'project'}
											<Button
												variant="ghost"
												size="sm"
												class="shrink-0"
												disabled={busy !== null}
												onclick={() => void reset(preference)}
											>
												Reset
											</Button>
										{/if}
										<Switch
											class="shrink-0"
											aria-label={readable(preference.name)}
											checked={preference.enabled}
											disabled={preference.locked || busy !== null}
											onCheckedChange={(enabled) => void toggle(preference, enabled)}
										/>
									</li>
								{/each}
							</ul>
						</div>
					{/each}
				</div>

				{#if filtered.length > PAGE_SIZE}
					<div class="flex flex-wrap items-center justify-between gap-3 pt-1">
						<p class="provenance-caption">
							Showing {start + 1}–{start + visible.length} of {filtered.length}
						</p>
						<!-- Pagination.Root centres itself by default; pulled right of the range. -->
						<Pagination.Root
							class="mx-0 w-auto"
							count={filtered.length}
							perPage={PAGE_SIZE}
							bind:page
						>
							{#snippet children({ pages, currentPage })}
								<Pagination.Content>
									<Pagination.Item><Pagination.Previous /></Pagination.Item>
									{#each pages as entry (entry.key)}
										<Pagination.Item>
											{#if entry.type === 'ellipsis'}
												<Pagination.Ellipsis />
											{:else}
												<Pagination.Link page={entry} isActive={currentPage === entry.value}>
													{entry.value}
												</Pagination.Link>
											{/if}
										</Pagination.Item>
									{/each}
									<Pagination.Item><Pagination.Next /></Pagination.Item>
								</Pagination.Content>
							{/snippet}
						</Pagination.Root>
					</div>
				{/if}
			{/if}
		</svelte:boundary>
	</div>
</section>
