<script lang="ts">
	import type { GetProjectOutput, NoteId, NoteSummary, ProjectTreeNode } from '$lib/models';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import Brain from '@lucide/svelte/icons/brain';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import FileText from '@lucide/svelte/icons/file-text';
	import FilePlus from '@lucide/svelte/icons/file-plus';
	import Folder from '@lucide/svelte/icons/folder';
	import FolderOpen from '@lucide/svelte/icons/folder-open';
	import ListTodo from '@lucide/svelte/icons/list-todo';
	import PackageOpen from '@lucide/svelte/icons/package-open';
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import Wrench from '@lucide/svelte/icons/wrench';
	import { SvelteSet } from 'svelte/reactivity';
	import { projectActions } from '$lib/stores/project-actions.svelte';
	import NameDialog from '../name-dialog.svelte';
	import ResourceRow from '../resource-row.svelte';
	import EmptyState from '../empty-state.svelte';
	import { pickTip } from '../resource-tips';
	import { formatRelativeTime } from '../labels';

	export interface ProjectCounts {
		todos: number;
		memory: number;
		artifacts: number;
		attachments: number;
	}

	let {
		view,
		counts,
		overdueTodoCount = 0,
		tipSeed = 0,
		renderedAt,
		oncreatenote
	}: {
		view: GetProjectOutput;
		counts: ProjectCounts;
		overdueTodoCount?: number;
		// Comes from the loader so SSR and hydration pick the same tips.
		tipSeed?: number;
		// The loader's instant — every relative timestamp formats against it so the
		// two first renders agree.
		renderedAt: string;
		oncreatenote?: () => void;
	} = $props();

	const now = $derived(Date.parse(renderedAt));

	const project = $derived(view.project);
	let renameEntryOpen = $state(false);
	let renameEntryId: NoteId | null = $state(null);
	let renameEntryTitle = $state('');

	function countEntries(nodes: readonly ProjectTreeNode[]): number {
		return nodes.reduce((total, node) => total + 1 + countEntries(node.children), 0);
	}

	function flatten(nodes: readonly ProjectTreeNode[]): NoteSummary[] {
		return nodes.flatMap((node) => [node.entry, ...flatten(node.children)]);
	}

	const entries = $derived(flatten(view.tree));

	// Documents named by the default title are a standing invitation, surfaced
	// beside the list heading rather than as a section of their own.
	const unnamed = $derived(entries.filter((entry) => entry.title === 'Untitled'));

	// A populated space states what it holds; an empty one gets a tip instead of a
	// zero. `undefined` state means "empty", which is what makes the row show its
	// tip — the two are deliberately exclusive.
	const todoState = $derived.by(() => {
		if (counts.todos === 0) return undefined;
		const open = `${counts.todos} open`;
		return overdueTodoCount > 0 ? `${open} · ${overdueTodoCount} overdue` : open;
	});

	const memoryState = $derived(
		counts.memory === 0 ? undefined : `${counts.memory} the agent can use`
	);

	const artifactState = $derived(
		counts.artifacts === 0 ? undefined : `${counts.artifacts} ready to download`
	);

	const attachmentState = $derived.by(() => {
		if (counts.attachments === 0) return undefined;
		return counts.attachments === 1
			? '1 file grounding the agent'
			: `${counts.attachments} files grounding the agent`;
	});

	// Folders have no page of their own, so the row opens in place — otherwise the
	// nested notes counted in the heading are unreachable from here.
	const expanded = new SvelteSet<NoteId>();

	function toggleFolder(id: NoteId): void {
		if (expanded.has(id)) expanded.delete(id);
		else expanded.add(id);
	}

	function startRename(id: NoteId, title: string): void {
		renameEntryId = id;
		renameEntryTitle = title;
		renameEntryOpen = true;
	}

	async function renameEntrySubmit(title: string): Promise<void> {
		if (!renameEntryId) return;
		const output = await projectActions.renameNote(renameEntryId, title);
		if (!output) toast.error('Could not rename. Try again.');
	}

	async function archiveEntry(id: NoteId): Promise<void> {
		const output = await projectActions.archiveNote(id);
		if (!output) toast.error('Could not archive. Try again.');
	}
</script>

<!--
	The four spaces are not peers, and grouping them is the explanation: two are
	what the project has produced, two are what the agent reasons from. The
	headings carry the meaning so the rows themselves stay quiet.
-->
<!--
	Spacing carries the grouping: 8px inside a group, 24px between the two groups,
	and the documents list is pushed a further step away below. Dividers are
	deliberately absent here — the documents list uses them, so withholding them
	is what stops four spaces from reading as five more documents.
-->
<nav class="flex flex-col gap-6" aria-label="Project spaces">
	<section class="flex flex-col gap-2">
		<h2 class="eyebrow">Produced here</h2>
		<ul class="-mx-3 flex flex-col">
			<ResourceRow
				href="/projects/{project.id}/todos"
				label="Todos"
				icon={ListTodo}
				state={todoState}
				tip={todoState ? undefined : pickTip('todos', tipSeed)}
			/>
			<ResourceRow
				href="/artifacts?projectId={project.id}"
				label="Artifacts"
				icon={PackageOpen}
				state={artifactState}
				tip={artifactState ? undefined : pickTip('artifacts', tipSeed)}
			/>
		</ul>
	</section>
	<section class="flex flex-col gap-2">
		<h2 class="eyebrow">What the agent works from</h2>
		<ul class="-mx-3 flex flex-col">
			<ResourceRow
				href="/projects/{project.id}/memory"
				label="Memory"
				icon={Brain}
				state={memoryState}
				tip={memoryState ? undefined : pickTip('memory', tipSeed)}
			/>
			<ResourceRow
				href="/projects/{project.id}/attachments"
				label="Attachments"
				icon={Paperclip}
				state={attachmentState}
				tip={attachmentState ? undefined : pickTip('attachments', tipSeed)}
			/>
		</ul>
	</section>
</nav>

<!--
	One row per entry, emitted flat into the divided list so the separators stay
	continuous; depth is carried by the left padding instead of nested lists.
-->
{#snippet row(node: ProjectTreeNode, depth: number)}
	{@const isFolder = node.entry.kind === 'folder'}
	{@const isOpen = expanded.has(node.entry.id)}
	<li class="group relative">
		{#if isFolder}
			<button
				type="button"
				class="row-interactive flex w-full items-center gap-2 py-3 pr-10 text-left text-sm"
				style="padding-left: {12 + depth * 20}px"
				aria-expanded={isOpen}
				onclick={() => toggleFolder(node.entry.id)}
			>
				<ChevronRight
					class="size-3.5 shrink-0 text-muted-foreground transition-transform duration-(--duration-micro) {isOpen
						? 'rotate-90'
						: ''}"
				/>
				{#if isOpen}
					<FolderOpen class="size-4 shrink-0 text-muted-foreground" />
				{:else}
					<Folder class="size-4 shrink-0 text-muted-foreground" />
				{/if}
				<span class="min-w-0 flex-1 truncate font-medium">{node.entry.title}</span>
				<span class="provenance-caption shrink-0">
					{node.children.length}
					{node.children.length === 1 ? 'item' : 'items'}
				</span>
			</button>
		{:else}
			<a
				class="row-interactive flex items-center gap-2 py-3 pr-10 text-sm"
				style="padding-left: {12 + depth * 20}px"
				href="/notes/{node.entry.id}"
			>
				{#if node.entry.kind === 'skill'}
					<Wrench class="size-4 shrink-0 text-muted-foreground" />
				{:else}
					<FileText class="size-4 shrink-0 text-muted-foreground" />
				{/if}
				<span class="min-w-0 flex-1 truncate">{node.entry.title}</span>
				<span class="provenance-caption shrink-0">
					{formatRelativeTime(node.entry.updatedAt, now)}
				</span>
			</a>
		{/if}
		<div
			class="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 has-data-[state=open]:opacity-100"
		>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							class="size-7"
							aria-label="Actions for {node.entry.title}"
						>
							<Ellipsis class="size-4" />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					<DropdownMenu.Item onclick={() => startRename(node.entry.id, node.entry.title)}>
						Rename
					</DropdownMenu.Item>
					<DropdownMenu.Item variant="destructive" onclick={() => void archiveEntry(node.entry.id)}>
						Archive
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</li>
	{#if isFolder && isOpen}
		{#each node.children as child (child.entry.id)}
			{@render row(child, depth + 1)}
		{/each}
	{/if}
{/snippet}

<!-- Documents -->
{#if view.tree.length === 0}
	<EmptyState
		icon={FileText}
		title="Nothing here yet."
		hint="Notes you write in this project show up here."
		class="py-16"
	>
		{#snippet action()}
			<Button size="sm" onclick={oncreatenote}>
				<FilePlus class="size-4" />
				Create the first note
			</Button>
		{/snippet}
	</EmptyState>
{:else}
	<!--
		A borderless divided list, not a card: the rows are homogeneous and
		scannable, so hairlines and hover carry the structure on their own.
	-->
	<!-- pt-6 on top of the shell's own gap puts a clear step between the spaces
	     cluster above and the documents list — the two are different in kind. -->
	<section class="flex flex-col gap-3 pt-6" aria-label="Documents">
		<div class="flex items-baseline justify-between gap-3">
			<h2 class="eyebrow">
				Documents · {countEntries(view.tree)}
			</h2>
			<!-- The one standing invitation the list itself cannot make. -->
			{#if unnamed.length > 0}
				<a class="provenance-caption hover:underline" href="/notes/{unnamed[0].id}">
					{unnamed.length}
					{unnamed.length === 1 ? 'document' : 'documents'} to name
				</a>
			{/if}
		</div>
		<!-- Bled 12px past the measure so row text aligns with the page title while
		     the hover wash and hairlines still read as a continuous list. -->
		<ul class="-mx-3 divide-y divide-border border-t border-border">
			{#each view.tree as node (node.entry.id)}
				{@render row(node, 0)}
			{/each}
		</ul>
	</section>
{/if}

<NameDialog
	bind:open={renameEntryOpen}
	title="Rename"
	label="Name"
	initialValue={renameEntryTitle}
	busy={projectActions.busy}
	onsubmit={renameEntrySubmit}
/>
