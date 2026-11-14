<script lang="ts">
	import type { CatalogEntryView, ConnectorCategory } from '$lib/models/connectors';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as Icon from '$lib/components/icons';
	import ConnectorLogo from './connector-logo.svelte';

	let {
		catalog,
		connecting,
		onconnect,
		onopen
	}: {
		catalog: readonly CatalogEntryView[];
		/** The entry whose sign-in is starting; every tile waits while one does. */
		connecting: string | undefined;
		onconnect: (view: CatalogEntryView) => void;
		/** A connected entry links to its page; the host closes around it. */
		onopen: () => void;
	} = $props();

	/** The order the catalog reads in: where most people's work is first. */
	const categories: readonly { readonly category: ConnectorCategory; readonly title: string }[] = [
		{ category: 'work', title: 'Work and projects' },
		{ category: 'documents', title: 'Documents and design' },
		{ category: 'engineering', title: 'Engineering' },
		{ category: 'monitoring', title: 'Monitoring and analytics' },
		{ category: 'customers', title: 'Sales and support' },
		{ category: 'finance', title: 'Payments' },
		{ category: 'automation', title: 'Automation' },
		{ category: 'research', title: 'Search and research' }
	];

	let search = $state('');
	const query = $derived(search.trim().toLowerCase());
	const matches = $derived(
		catalog.filter(
			(view) =>
				view.entry.title.toLowerCase().includes(query) ||
				view.entry.description.toLowerCase().includes(query)
		)
	);
	/** Grouped while browsing; one ranked list while searching, so a match is not hunted for. */
	const groups = $derived(
		query.length > 0
			? [{ title: undefined, views: matches }]
			: categories.flatMap(({ category, title }) => {
					const views = catalog.filter((view) => view.entry.category === category);
					return views.length > 0 ? [{ title, views }] : [];
				})
	);

	/** A ghost button stretched into a tile, as in the widget picker. */
	const tileClass =
		'flex h-auto w-full items-start justify-start gap-3 p-3 text-left font-normal whitespace-normal';

	const caption = (view: CatalogEntryView): string => {
		if (view.availability.kind === 'connected') return 'Connected';
		return view.entry.authentication.kind === 'none'
			? 'No sign-in needed'
			: `Sign in with ${view.entry.title}`;
	};
</script>

{#snippet tile(view: CatalogEntryView)}
	<ConnectorLogo logo={{ kind: 'catalog', catalogId: view.entry.id }} title={view.entry.title} />
	<span class="flex min-w-0 flex-1 flex-col gap-bind">
		<span class="text-sm font-medium">{view.entry.title}</span>
		<span class="text-sm text-muted-foreground">{view.entry.description}</span>
		<span class="provenance-caption">
			{#if connecting === view.entry.id}
				Opening {view.entry.title}…
			{:else}
				{caption(view)}
			{/if}
		</span>
	</span>
	{#if connecting === view.entry.id}
		<Spinner class="shrink-0" />
	{:else if view.availability.kind === 'connected'}
		<Icon.Check class="size-4 shrink-0 text-muted-foreground" />
	{/if}
{/snippet}

<div class="flex flex-col gap-row">
	<Input
		bind:value={search}
		placeholder="Find a service: Stripe, Figma, GitHub…"
		aria-label="Find a service"
		autocomplete="off"
	/>
	<!-- Tiles rest flat and take the hover wash, like the widget picker: the logos
	     already give the grid its structure, and the groups are set apart by space. -->
	<div class="flex max-h-112 flex-col gap-group overflow-y-auto pr-3" data-connector-catalog>
		{#if matches.length === 0}
			<p class="py-6 text-sm text-muted-foreground">
				No service in the catalog matches “{search.trim()}”. A server it does not list can still be
				added as a custom server.
			</p>
		{/if}
		{#each groups as group (group.title ?? 'matches')}
			<section class="flex flex-col gap-bind" aria-label={group.title ?? 'Matching services'}>
				{#if group.title}
					<h3 class="eyebrow">{group.title}</h3>
				{/if}
				<ul class="grid grid-cols-1 gap-item sm:grid-cols-2">
					{#each group.views as view (view.entry.id)}
						<li>
							{#if view.availability.kind === 'connected'}
								<Button
									variant="ghost"
									class={tileClass}
									href="/settings?tab=connectors&connector={view.availability.connectorId}"
									onclick={onopen}
								>
									{@render tile(view)}
								</Button>
							{:else}
								<Button
									variant="ghost"
									class={tileClass}
									disabled={connecting !== undefined}
									aria-label="Connect {view.entry.title}"
									onclick={() => onconnect(view)}
								>
									{@render tile(view)}
								</Button>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
</div>
