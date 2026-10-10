<script lang="ts">
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import type { Widget } from '$lib/models/widgets';
	import type { Project, ProjectId } from '$lib/models/projects';
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Form } from '$lib/components/ui/form';
	import { Label } from '$lib/components/ui/label';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as InputGroup from '$lib/components/ui/input-group';
	import * as Pagination from '$lib/components/ui/pagination';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import EmptyState from '$lib/components/shared/empty-state.svelte';
	import * as Icon from '$lib/components/icons';
	import { formatDateTime } from '$lib/components/shared/labels';
	import { widgetReferencesIn } from '$lib/services/notes/references';
	import { workspaceSession } from '$lib/stores/workspace/session.svelte';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';
	import { widgetTab } from '$lib/stores/workbench/tab-ref';
	import { widgetEdits } from '$lib/stores/widgets/widget-edits.svelte';
	import WidgetView from '../widget-view.svelte';
	import { widgetSources } from '$lib/stores/widgets/widget-sources.svelte';

	export interface WidgetGalleryData {
		readonly widgets: readonly Widget[];
		readonly total: number;
		readonly query: string;
		readonly page: number;
		readonly pageSize: number;
		readonly selectedProjectId: ProjectId | null;
		readonly project?: Project;
	}

	let { data }: { data: WidgetGalleryData } = $props();

	let searchValue = $derived(data.query);
	let removeTarget = $state<Widget | undefined>(undefined);
	let removing = $state(false);

	// The count is only honest once every note is on this device; until then it says so.
	const references = $derived.by(() => {
		if (!removeTarget) return null;
		const resources = workspaceSession.current?.resources;
		if (!resources || resources.availability !== 'complete') return null;
		const id = removeTarget.id;
		return resources.views.all('notes').filter((note) => widgetReferencesIn([note]).includes(id))
			.length;
	});

	// Mirrors the loader's canonical URL, so navigation never takes an extra redirect.
	function urlFor(page: number, query = data.query): string {
		const params = new SvelteURLSearchParams({ projectId: data.selectedProjectId! });
		if (query) params.set('q', query);
		if (page > 1) params.set('page', String(page));
		return `/widgets?${params}`;
	}

	async function submitSearch(): Promise<void> {
		searchValue = searchValue.trim();
		await goto(urlFor(1, searchValue));
	}

	async function clearSearch(): Promise<void> {
		searchValue = '';
		await goto(urlFor(1, ''));
	}

	const open = (widget: Widget) => void workbench.openTab(widgetTab(widget.id));

	/** A widget needs no note: start a blank one here and open it to be edited. */
	async function startWidget(): Promise<{ kind: 'opened' } | { kind: 'failure'; message: string }> {
		const projectId = data.selectedProjectId;
		if (!projectId) return { kind: 'failure', message: 'Select a project first' };
		try {
			const widgetId = await widgetEdits.createFromTemplate({ template: 'blank', projectId });
			await workbench.openTab(widgetTab(widgetId));
			return { kind: 'opened' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'The widget could not be created';
			toast.error(message);
			return { kind: 'failure', message };
		}
	}

	async function confirmRemove(): Promise<void> {
		const target = removeTarget;
		if (!target || removing) return;
		removing = true;
		const outcome = await widgetEdits.changeTrash(target.id, 'archive');
		removing = false;
		// A refused move keeps the dialog open; the store has already said why.
		if (outcome.kind === 'staged') removeTarget = undefined;
	}
</script>

<PageShell
	width="wide"
	title="Widgets"
	description="Checklists and trackers you can embed in notes."
>
	<!-- Ancestors only: the trailing crumb would restate the h1 directly beneath it. -->
	{#snippet breadcrumb()}
		{#if data.project}
			<Breadcrumb.Root>
				<Breadcrumb.List>
					<Breadcrumb.Item>
						<Breadcrumb.Link href="/projects/{data.project.id}">{data.project.name}</Breadcrumb.Link
						>
					</Breadcrumb.Item>
				</Breadcrumb.List>
			</Breadcrumb.Root>
		{/if}
	{/snippet}

	{#snippet actions()}
		{#if data.selectedProjectId}
			<Button onclick={() => void startWidget()}>New widget</Button>
		{/if}
	{/snippet}

	{#if !data.selectedProjectId}
		<EmptyState
			icon={Icon.Widget}
			title="Select a project to see its widgets."
			size="large"
			label="Widgets"
		/>
	{:else}
		{#if data.widgets.length > 0 || data.query}
			<Form
				class="mb-6 max-w-xl"
				onsubmit={(event) => {
					event.preventDefault();
					void submitSearch();
				}}
			>
				<Label class="sr-only" for="widget-search">Search widgets</Label>
				<InputGroup.Root>
					<InputGroup.Input
						id="widget-search"
						bind:value={searchValue}
						placeholder="Search a widget title"
					/>
					<InputGroup.Addon align="inline-end">
						{#if data.query}
							<InputGroup.Button aria-label="Clear search" onclick={clearSearch}>
								<Icon.Close /> Clear
							</InputGroup.Button>
						{/if}
						<InputGroup.Button type="submit" variant="default">
							<Icon.Search /> Search
						</InputGroup.Button>
					</InputGroup.Addon>
				</InputGroup.Root>
			</Form>
		{/if}

		{#if data.widgets.length === 0 && data.query}
			<EmptyState icon={Icon.Search} title="No widgets match “{data.query}”.">
				{#snippet action()}
					<Button variant="outline" onclick={clearSearch}>Clear search</Button>
				{/snippet}
			</EmptyState>
		{:else if data.widgets.length === 0}
			<EmptyState
				icon={Icon.Widget}
				title="No widgets yet."
				hint="Type /widget in a note to add one. It is saved here and can be shown in other notes."
				size="large"
				label="Widgets"
			/>
		{:else}
			<!-- A grid of live previews, as the diagram gallery is: the widget is the thing scanned. -->
			<ul class="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
				{#each data.widgets as widget (widget.id)}
					<li class="group flex min-w-0 flex-col gap-2" data-widget-card={widget.id}>
						<Button
							variant="ghost"
							class="block h-48 w-full overflow-hidden rounded-2xl p-0 text-left font-normal whitespace-normal hover:bg-transparent"
							aria-label="Open {widget.title}"
							onclick={() => open(widget)}
						>
							<div class="pointer-events-none">
								<WidgetView {widget} sources={widgetSources(widget)} />
							</div>
						</Button>
						<div class="flex min-w-0 items-start gap-2">
							<div class="min-w-0 flex-1">
								<Button
									variant="link"
									class="block h-auto max-w-full truncate p-0 text-left text-sm font-medium text-foreground"
									onclick={() => open(widget)}
								>
									{widget.title}
								</Button>
								<p class="provenance-caption">Updated {formatDateTime(widget.updatedAt)}</p>
							</div>
							<div
								class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 has-data-[state=open]:opacity-100"
							>
								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										{#snippet child({ props })}
											<Button
												{...props}
												variant="ghost"
												size="icon-sm"
												class="size-7"
												aria-label="Actions for {widget.title}"
											>
												<Icon.Ellipsis class="size-4" />
											</Button>
										{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="end">
										<DropdownMenu.Item onclick={() => open(widget)}>Open</DropdownMenu.Item>
										<DropdownMenu.Item
											variant="destructive"
											onclick={() => (removeTarget = widget)}
										>
											Move to trash
										</DropdownMenu.Item>
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							</div>
						</div>
					</li>
				{/each}
			</ul>

			{#if data.total > data.pageSize}
				<Pagination.Root
					count={data.total}
					perPage={data.pageSize}
					page={data.page}
					onPageChange={(page) => void goto(urlFor(page))}
				>
					{#snippet children({ pages, currentPage })}
						<Pagination.Content>
							<Pagination.Item><Pagination.Previous /></Pagination.Item>
							{#each pages as page (page.key)}
								<Pagination.Item>
									{#if page.type === 'ellipsis'}
										<Pagination.Ellipsis />
									{:else}
										<Pagination.Link {page} isActive={currentPage === page.value}>
											{page.value}
										</Pagination.Link>
									{/if}
								</Pagination.Item>
							{/each}
							<Pagination.Item><Pagination.Next /></Pagination.Item>
						</Pagination.Content>
					{/snippet}
				</Pagination.Root>
			{/if}
		{/if}
	{/if}
</PageShell>

<!-- One dialog for the grid. It says what removal does to the notes that embed the widget. -->
<AlertDialog.Root
	open={removeTarget !== undefined}
	onOpenChange={(next) => {
		if (!next) removeTarget = undefined;
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Move this widget to the trash?</AlertDialog.Title>
			<AlertDialog.Description>
				{#if references === null}
					The reference count is unavailable. Notes that embed this widget will show it as in the
					trash until you restore it.
				{:else if references > 0}
					{references === 1
						? 'One note embeds this widget and will show it as in the trash until you restore it.'
						: `${references} notes embed this widget and will show it as in the trash until you restore it.`}
				{:else}
					No note embeds this widget. You can restore it from the trash.
				{/if}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={removing}>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action disabled={removing} onclick={() => void confirmRemove()}
				>{removing ? 'Moving…' : 'Move to trash'}</AlertDialog.Action
			>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
