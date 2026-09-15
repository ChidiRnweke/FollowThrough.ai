<script lang="ts">
	import { goto } from '$app/navigation';
	import { changeDiagramTrash } from '$lib/stores/diagrams/trash-actions';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import type { Diagram } from '$lib/models/diagrams';
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
	import DiagramPreview from '../diagram-preview.svelte';
	import {
		FtWorkflow as Workflow,
		FtSearch as Search,
		FtClose as X,
		FtEllipsis as Ellipsis
	} from '$lib/components/icons';
	import { formatDateTime } from '$lib/components/shared/labels';
	import { drawioReferencesIn } from '$lib/models/notes';
	import { workspaceSession } from '$lib/stores/workspace/session.svelte';
	import { chatRegistry } from '$lib/stores/agent/registries/chat-registry.svelte';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';
	import { chatTab, diagramTab } from '$lib/stores/workbench/tab-ref';
	import { diagramRegistry } from '$lib/stores/diagrams/registries/diagram-registry.svelte';

	export interface DiagramGalleryData {
		readonly diagrams: readonly Diagram[];
		readonly total: number;
		readonly query: string;
		readonly page: number;
		readonly pageSize: number;
		readonly selectedProjectId: ProjectId | null;
		readonly project?: Project;
	}

	let { data }: { data: DiagramGalleryData } = $props();

	const diagrams = $derived<readonly Diagram[]>(data.diagrams);
	let searchValue = $derived(data.query);
	let removeTarget = $state<Diagram | undefined>(undefined);
	let removeOpen = $state(false);
	let removing = $state(false);

	const references = $derived.by(() => {
		if (!removeTarget) return null;
		const resources = workspaceSession.current?.resources;
		if (!resources || resources.availability !== 'complete') return null;
		const id = removeTarget.id;
		return resources.views.all('notes').filter((note) => drawioReferencesIn([note]).includes(id))
			.length;
	});

	// Mirrors the loader's canonical URL exactly. A mismatch would make every
	// navigation take an extra redirect hop.
	function urlFor(page: number, query = data.query): string {
		const params = new SvelteURLSearchParams({ projectId: data.selectedProjectId! });
		if (query) params.set('q', query);
		if (page > 1) params.set('page', String(page));
		return `/diagrams?${params}`;
	}

	async function navigate(page: number): Promise<void> {
		await goto(urlFor(page));
	}

	async function submitSearch(): Promise<void> {
		const query = searchValue.trim();
		searchValue = query;
		await goto(urlFor(1, query));
	}

	async function clearSearch(): Promise<void> {
		searchValue = '';
		await goto(urlFor(1, ''));
	}

	/**
	 * The studio is a conversation, and nothing more until there is something to
	 * show: opening a canvas here would hand the user an empty half-screen to
	 * explain. The canvas arrives on its own when the agent presents a diagram.
	 */
	/**
	 * Starting a diagram opens the studio, not a chat that might become one.
	 *
	 * The canvas is empty at this point and says so, which is the affordance: the
	 * user asked for a diagram, so the place it will appear should be visible from
	 * the first message rather than arriving under them mid-answer. (An *incidental*
	 * diagram in an ordinary chat still waits for its first draft — that rule lives
	 * in `canvas-opening.ts` and is untouched.)
	 */
	async function startDiagram(): Promise<void> {
		if (!data.selectedProjectId) return;
		const sessionKey = chatRegistry.mint();
		diagramRegistry.useProject(sessionKey, data.selectedProjectId);
		// Just the chat. There is no canvas to open yet: the diagram exists once the
		// agent creates it, and its own tab opens then. Opening an empty canvas first
		// showed a pane with nothing in it and a Save button that could not be used.
		await workbench.openTab(chatTab(sessionKey));
	}

	/**
	 * Open a saved diagram beside the conversation that produced it.
	 *
	 * A diagram is the residue of a conversation, so reopening one without it
	 * strands the user: the way to change a diagram is to keep talking about it.
	 * A diagram with no conversation — one converted from a note — opens alone,
	 * because there is nothing to open beside it.
	 */
	async function openDiagram(diagram: Diagram): Promise<void> {
		if (!diagram.conversationId) {
			await goto(`/diagrams/${diagram.id}`);
			return;
		}
		const sessionKey = chatRegistry.sessionKeyFor(diagram.conversationId);
		await workbench.openSplit(diagramTab(diagram.id), chatTab(sessionKey));
	}

	function askRemove(diagram: Diagram): void {
		removeTarget = diagram;
		removeOpen = true;
	}

	async function confirmRemove(): Promise<void | { kind: 'failure' }> {
		const target = removeTarget;
		if (!target || removing) return;
		removing = true;
		try {
			await changeDiagramTrash(target.id, 'archive');
			removeOpen = false;
			removeTarget = undefined;
		} catch {
			// The shared action reports the storage error; keep this confirmation open.
			return { kind: 'failure' };
		} finally {
			removing = false;
		}
	}
</script>

<PageShell
	width="wide"
	title="Diagrams"
	description="Diagrams produced in conversation, ready to link into notes."
>
	<!-- Ancestors only: the trailing crumb would restate the h1 directly beneath it. -->
	{#snippet breadcrumb()}
		{#if data.project}
			<Breadcrumb.Root>
				<Breadcrumb.List>
					<Breadcrumb.Item>
						<Breadcrumb.Link href="/projects/{data.project.id}">
							{data.project.name}
						</Breadcrumb.Link>
					</Breadcrumb.Item>
				</Breadcrumb.List>
			</Breadcrumb.Root>
		{/if}
	{/snippet}
	{#snippet actions()}
		{#if data.selectedProjectId}
			<Button onclick={startDiagram}>New diagram</Button>
		{/if}
	{/snippet}

	{#if !data.selectedProjectId}
		<EmptyState
			icon={Workflow}
			title="Select a project to see its diagrams."
			size="large"
			label="Diagrams"
		/>
	{:else}
		<!-- Nothing to search until there is something to find. -->
		{#if diagrams.length > 0 || data.query}
			<Form
				class="mb-6 max-w-xl"
				onsubmit={(event) => {
					event.preventDefault();
					void submitSearch();
				}}
			>
				<Label class="sr-only" for="diagram-search">Search diagrams</Label>
				<InputGroup.Root>
					<InputGroup.Input
						id="diagram-search"
						bind:value={searchValue}
						placeholder="Search a title or a label inside a diagram"
					/>
					<InputGroup.Addon align="inline-end">
						{#if data.query}
							<InputGroup.Button aria-label="Clear search" onclick={clearSearch}>
								<X /> Clear
							</InputGroup.Button>
						{/if}
						<InputGroup.Button type="submit" variant="default">
							<Search /> Search
						</InputGroup.Button>
					</InputGroup.Addon>
				</InputGroup.Root>
			</Form>
		{/if}

		{#if diagrams.length === 0 && data.query}
			<EmptyState icon={Search} title="No diagrams match “{data.query}”.">
				{#snippet action()}
					<Button variant="outline" onclick={clearSearch}>Clear search</Button>
				{/snippet}
			</EmptyState>
		{:else if diagrams.length === 0}
			<EmptyState
				icon={Workflow}
				title="No diagrams yet."
				hint="A diagram starts in conversation, and can be linked into any note once you keep it."
				size="large"
				label="Diagrams"
			/>
		{:else}
			<!--
				A grid rather than the app's usual divided list: these rows are pictures,
				not homogeneous text, so the preview is the thing being scanned. The
				previews stay unboxed — the hairline belongs to the whole cell, and a
				card around each one would nest same-weight rectangles.
			-->
			<ul class="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
				{#each diagrams as diagram (diagram.id)}
					<li class="group flex min-w-0 flex-col gap-2">
						<a
							href="/diagrams/{diagram.id}"
							class="block overflow-hidden rounded-md ring-1 ring-inset ring-border"
							onclick={(event) => {
								if (event.metaKey || event.ctrlKey || event.shiftKey) return;
								event.preventDefault();
								void openDiagram(diagram);
							}}
						>
							<div class="h-40 w-full bg-background p-2">
								<DiagramPreview
									kind={diagram.kind}
									source={diagram.source}
									renderedSvg={diagram.renderedSvg}
									title={diagram.title ?? 'Untitled diagram'}
									class="h-full w-full object-contain"
								/>
							</div>
						</a>
						<div class="flex min-w-0 items-start gap-2">
							<div class="min-w-0 flex-1">
								<a
									href="/diagrams/{diagram.id}"
									class="block truncate text-sm font-medium"
									onclick={(event) => {
										if (event.metaKey || event.ctrlKey || event.shiftKey) return;
										event.preventDefault();
										void openDiagram(diagram);
									}}
								>
									{diagram.title ?? 'Untitled diagram'}
								</a>
								<p class="provenance-caption">
									draw.io · {formatDateTime(diagram.updatedAt)}
								</p>
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
												aria-label="Actions for {diagram.title ?? 'Untitled diagram'}"
											>
												<Ellipsis class="size-4" />
											</Button>
										{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="end">
										<DropdownMenu.Item onclick={() => void openDiagram(diagram)}>
											Open
										</DropdownMenu.Item>
										<DropdownMenu.Item variant="destructive" onclick={() => askRemove(diagram)}>
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
					onPageChange={(page) => void navigate(page)}
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

<!--
	One dialog for the whole grid rather than one per row, and it says what the
	removal will break before it happens: a diagram can be rendered by notes that
	will show it as unavailable until it is restored.
-->
<AlertDialog.Root
	open={removeOpen}
	onOpenChange={(open) => {
		removeOpen = open;
		// The closed dialog retains no resource selection.
		if (!open) removeTarget = undefined;
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Move this diagram to the trash?</AlertDialog.Title>
			<AlertDialog.Description>
				{#if references === null}
					The reference count is unavailable. Notes that use this diagram will show it as
					unavailable until you restore it.
				{:else if references > 0}
					{references === 1
						? 'One note renders this diagram and will show it as unavailable until you restore it.'
						: `${references} notes render this diagram and will show it as unavailable until you restore it.`}
				{:else}
					No note renders this diagram. You can restore it from the trash.
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
