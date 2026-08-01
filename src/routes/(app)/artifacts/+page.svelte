<script lang="ts">
	import { Form } from '$lib/components/ui/form';
	import { Label } from '$lib/components/ui/label';
	import type { ArtifactId, ArtifactView } from '$lib/models/deliverables';
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import {
		FtDownload as Download,
		FtExport as FileOutput,
		FtDocument as FileText,
		FtArtifacts as PackageOpen,
		FtSearch as Search,
		FtClose as X,
		FtRetry as RefreshCw,
		FtTrash as Trash2
	} from '$lib/components/icons';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Tip } from '$lib/components/ui/tooltip';
	import { mergeProps } from '$lib/utils';
	import ConfirmDelete from '$lib/components/shared/confirm-delete.svelte';
	import {
		deleteArtifact,
		downloadArtifact,
		regenerateArtifact
	} from '$lib/remote/deliverables/deliverables.remote';
	import { formatBytes, formatDateTime } from '$lib/components/shared/labels';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import * as InputGroup from '$lib/components/ui/input-group';
	import * as Pagination from '$lib/components/ui/pagination';
	import EmptyState from '$lib/components/shared/empty-state.svelte';
	import AgentAction from '$lib/components/agent/agent-action.svelte';
	import { agentActions } from '$lib/components/agent/agent-actions';
	import { goto, invalidateAll } from '$app/navigation';
	import { SvelteURLSearchParams } from 'svelte/reactivity';

	let { data } = $props();

	let artifacts = $derived<ArtifactView[]>([...data.artifacts]);
	let busyId = $state<ArtifactId | undefined>(undefined);
	let searchValue = $derived(data.query);

	async function download(id: ArtifactId): Promise<void> {
		busyId = id;
		try {
			const { url } = await downloadArtifact({ artifactId: id });
			window.location.assign(url);
		} catch {
			toast.error('Could not prepare the download.');
		} finally {
			busyId = undefined;
		}
	}

	async function regenerate(id: ArtifactId): Promise<void> {
		busyId = id;
		try {
			const output = await regenerateArtifact({ artifactId: id });
			window.location.assign(output.downloadUrl);
			toast.success('Document regenerated');
		} catch {
			toast.error('Could not regenerate the document.');
		} finally {
			busyId = undefined;
		}
	}

	async function remove(id: ArtifactId): Promise<void> {
		const previous = artifacts;
		artifacts = artifacts.filter((artifact) => artifact.id !== id);
		try {
			await deleteArtifact({ artifactId: id });
			if (previous.length === 1 && data.page > 1) {
				await navigate(data.page - 1);
			} else {
				await invalidateAll();
			}
		} catch {
			artifacts = previous;
			toast.error('Could not delete the artifact.');
		}
	}

	function urlFor(page: number, query = data.query): string {
		const params = new SvelteURLSearchParams({ projectId: data.selectedProjectId! });
		if (query) params.set('q', query);
		if (page > 1) params.set('page', String(page));
		return `/artifacts?${params}`;
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
</script>

<PageShell
	title="Artifacts"
	description="Documents and exports generated from your notes and project context."
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
			<AgentAction
				action={agentActions.artifactsExport}
				context={{ projectId: data.selectedProjectId }}
			/>
		{/if}
	{/snippet}
	{#if !data.selectedProjectId}
		<EmptyState
			icon={PackageOpen}
			title="Select a project to see its artifacts."
			size="large"
			label="Artifacts"
		/>
	{:else}
		<!-- Nothing to search until there is something to find: the bar only appears
		     with artifacts on the page or a query already narrowing them. -->
		{#if artifacts.length > 0 || data.query}
			<Form
				class="mb-4 max-w-xl"
				onsubmit={(event) => {
					event.preventDefault();
					void submitSearch();
				}}
			>
				<Label class="sr-only" for="artifact-search">Search artifacts</Label>
				<InputGroup.Root>
					<InputGroup.Input
						id="artifact-search"
						bind:value={searchValue}
						placeholder="Search title, format, or template"
					/>
					<InputGroup.Addon align="inline-end">
						{#if data.query}
							<InputGroup.Button aria-label="Clear search" onclick={clearSearch}
								><X /> Clear</InputGroup.Button
							>
						{/if}
						<InputGroup.Button type="submit" variant="default"><Search /> Search</InputGroup.Button>
					</InputGroup.Addon>
				</InputGroup.Root>
			</Form>
		{/if}
		{#if artifacts.length === 0 && data.query}
			<EmptyState icon={Search} title="No artifacts match “{data.query}”." size="large">
				{#snippet action()}
					<Button variant="outline" onclick={clearSearch}>Clear search</Button>
				{/snippet}
			</EmptyState>
		{:else if artifacts.length === 0}
			<EmptyState
				icon={FileOutput}
				title="No artifacts yet."
				hint="Exports of your notes and project documents show up here."
				size="large"
				label="Artifacts"
			/>
		{:else}
			<!-- Homogeneous rows, so a borderless divided list — never a bordered box
			     wrapping same-weight rectangles. Bled 12px past the measure so titles
			     align with the page text while hover washes and hairlines stay continuous. -->
			<ul class="-mx-3 divide-y divide-border border-t border-border">
				{#each artifacts as artifact (artifact.id)}
					<li class="row-interactive flex items-center justify-between gap-3 px-3 py-2.5">
						<div class="flex min-w-0 items-center gap-3">
							{#if artifact.format === 'docx'}
								<FileText class="shrink-0" />
							{:else}
								<FileOutput class="shrink-0" />
							{/if}
							<div class="flex min-w-0 flex-col gap-0.5">
								<span class="truncate text-sm font-medium">{artifact.title}</span>
								<span class="text-xs text-muted-foreground">
									{artifact.sourceNoteIds.length} note{artifact.sourceNoteIds.length !== 1
										? 's'
										: ''}
									&middot;
									{formatDateTime(artifact.createdAt)}
									&middot; {formatBytes(artifact.byteSize)}
									{#if artifact.templateName}
										&middot; {artifact.templateName}
									{/if}
								</span>
							</div>
						</div>
						<div class="flex shrink-0 items-center gap-2">
							{#if artifact.stale}
								<Tip text="A source note changed after this was generated — regenerate to refresh">
									{#snippet children({ props })}
										<Badge {...props} variant="ghost" class="bg-warning/15 text-warning">
											Source changed
										</Badge>
									{/snippet}
								</Tip>
							{/if}
							<Badge variant="brand" class="text-xs">{artifact.format.toUpperCase()}</Badge>
							<Tip text="Download">
								{#snippet children({ props })}
									<Button
										{...props}
										variant="ghost"
										size="icon-sm"
										aria-label="Download"
										disabled={busyId === artifact.id}
										onclick={() => download(artifact.id)}
									>
										<Download />
									</Button>
								{/snippet}
							</Tip>
							<Tip text="Regenerate">
								{#snippet children({ props })}
									<Button
										{...props}
										variant="ghost"
										size="icon-sm"
										aria-label="Regenerate"
										disabled={busyId === artifact.id}
										onclick={() => regenerate(artifact.id)}
									>
										<RefreshCw />
									</Button>
								{/snippet}
							</Tip>
							<ConfirmDelete
								title="Delete this artifact?"
								description="The exported document will be permanently removed."
								onconfirm={() => remove(artifact.id)}
							>
								{#snippet trigger(confirmProps)}
									<Tip text="Delete">
										{#snippet children({ props: tipProps })}
											<Button
												{...mergeProps(confirmProps as Record<string, unknown>, tipProps)}
												variant="ghost"
												size="icon-sm"
												aria-label="Delete"
												disabled={busyId === artifact.id}
											>
												<Trash2 />
											</Button>
										{/snippet}
									</Tip>
								{/snippet}
							</ConfirmDelete>
						</div>
					</li>
				{/each}
			</ul>
			{#if data.total > data.pageSize}
				<div class="mt-4 flex flex-col items-center gap-2">
					<p class="text-sm text-muted-foreground">
						{data.total}
						{data.query ? 'matching ' : ''}artifacts
					</p>
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
										{#if page.type === 'ellipsis'}<Pagination.Ellipsis />{:else}<Pagination.Link
												{page}
												isActive={currentPage === page.value}>{page.value}</Pagination.Link
											>{/if}
									</Pagination.Item>
								{/each}
								<Pagination.Item><Pagination.Next /></Pagination.Item>
							</Pagination.Content>
						{/snippet}
					</Pagination.Root>
				</div>
			{/if}
		{/if}
	{/if}
</PageShell>
