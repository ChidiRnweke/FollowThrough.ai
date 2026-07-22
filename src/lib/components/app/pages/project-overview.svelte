<script lang="ts">
	import type { GetProjectOutput, NoteId, ProjectTreeNode } from '$lib/models';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import Brain from '@lucide/svelte/icons/brain';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import FileText from '@lucide/svelte/icons/file-text';
	import FilePlus from '@lucide/svelte/icons/file-plus';
	import Folder from '@lucide/svelte/icons/folder';
	import ListTodo from '@lucide/svelte/icons/list-todo';
	import PackageOpen from '@lucide/svelte/icons/package-open';
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import Wrench from '@lucide/svelte/icons/wrench';
	import { projectActions } from '$lib/stores/project-actions.svelte';
	import NameDialog from '../name-dialog.svelte';
	import { formatDateTime } from '../labels';

	export interface ProjectCounts {
		todos: number;
		memory: number;
		artifacts: number;
		attachments: number;
	}

	let {
		view,
		counts,
		oncreatenote
	}: { view: GetProjectOutput; counts: ProjectCounts; oncreatenote?: () => void } = $props();

	const project = $derived(view.project);
	let renameEntryOpen = $state(false);
	let renameEntryId: NoteId | null = $state(null);
	let renameEntryTitle = $state('');

	function countEntries(nodes: readonly ProjectTreeNode[]): number {
		return nodes.reduce((total, node) => total + 1 + countEntries(node.children), 0);
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

<!-- Destination strip -->
<nav class="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Project spaces">
	<a
		href="/projects/{project.id}/todos"
		class="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
	>
		<!-- Brand-wash icon chips give the four project spaces a shared identity
		     without recoloring the cards themselves. -->
		<span class="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
			<ListTodo class="size-4" />
		</span>
		<span class="flex-1">Todos</span>
		{#if counts.todos > 0}
			<span class="text-xs tabular-nums text-muted-foreground">{counts.todos}</span>
		{/if}
	</a>
	<a
		href="/projects/{project.id}/memory"
		class="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
	>
		<span class="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
			<Brain class="size-4" />
		</span>
		<span class="flex-1">Memory</span>
		{#if counts.memory > 0}
			<span class="text-xs tabular-nums text-muted-foreground">{counts.memory}</span>
		{/if}
	</a>
	<a
		href="/artifacts?projectId={project.id}"
		class="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
	>
		<span class="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
			<PackageOpen class="size-4" />
		</span>
		<span class="flex-1">Artifacts</span>
		{#if counts.artifacts > 0}
			<span class="text-xs tabular-nums text-muted-foreground">{counts.artifacts}</span>
		{/if}
	</a>
	<a
		href="/projects/{project.id}/attachments"
		class="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
	>
		<span class="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
			<Paperclip class="size-4" />
		</span>
		<span class="flex-1">Attachments</span>
		{#if counts.attachments > 0}
			<span class="text-xs tabular-nums text-muted-foreground">{counts.attachments}</span>
		{/if}
	</a>
</nav>

<!-- Documents -->
{#if view.tree.length === 0}
	<div
		class="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 text-center"
	>
		<p class="text-sm text-muted-foreground">This project is empty.</p>
		<Button size="sm" onclick={oncreatenote}>
			<FilePlus class="size-4" />
			Create the first note
		</Button>
	</div>
{:else}
	<section class="flex flex-col gap-2" aria-label="Documents">
		<h2 class="eyebrow">
			Documents · {countEntries(view.tree)}
		</h2>
		<ul class="divide-y divide-border rounded-lg border border-border">
			{#each view.tree as node (node.entry.id)}
				<li class="group relative">
					{#if node.entry.kind === 'folder'}
						<div class="flex items-center gap-2 px-3 py-2.5 pr-10 text-sm">
							<Folder class="size-4 shrink-0 text-muted-foreground" />
							<span class="min-w-0 flex-1 truncate font-medium">
								{node.entry.title}
							</span>
							<span class="shrink-0 text-xs text-muted-foreground">
								{node.children.length}
								{node.children.length === 1 ? 'item' : 'items'}
							</span>
						</div>
					{:else}
						<a
							class="row-interactive flex items-center gap-2 px-3 py-2.5 pr-10 text-sm"
							href="/notes/{node.entry.id}"
						>
							{#if node.entry.kind === 'skill'}
								<Wrench class="size-4 shrink-0 text-muted-foreground" />
							{:else}
								<FileText class="size-4 shrink-0 text-muted-foreground" />
							{/if}
							<span class="min-w-0 flex-1 truncate">{node.entry.title}</span>
							<span class="shrink-0 text-xs text-muted-foreground">
								{formatDateTime(node.entry.updatedAt)}
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
								<DropdownMenu.Item
									variant="destructive"
									onclick={() => void archiveEntry(node.entry.id)}
								>
									Archive
								</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					</div>
				</li>
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
