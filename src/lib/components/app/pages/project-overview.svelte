<script lang="ts">
	import type { GetProjectOutput, ProjectTreeNode } from '$lib/models';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { toast } from 'svelte-sonner';
	import Brain from '@lucide/svelte/icons/brain';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import FilePlus from '@lucide/svelte/icons/file-plus';
	import FileText from '@lucide/svelte/icons/file-text';
	import Folder from '@lucide/svelte/icons/folder';
	import FolderPlus from '@lucide/svelte/icons/folder-plus';
	import ListTodo from '@lucide/svelte/icons/list-todo';
	import Wrench from '@lucide/svelte/icons/wrench';
	import { projectActions } from '$lib/stores/project-actions.svelte';
	import { rightPanel } from '$lib/stores/right-panel.svelte';
	import NameDialog from '../name-dialog.svelte';
	import { formatDateTime } from '../labels';

	let { view }: { view: GetProjectOutput } = $props();

	const project = $derived(view.project);
	let renameOpen = $state(false);
	let newNoteOpen = $state(false);
	let newFolderOpen = $state(false);

	function countEntries(nodes: readonly ProjectTreeNode[]): number {
		return nodes.reduce((total, node) => total + 1 + countEntries(node.children), 0);
	}

	async function createNote(title: string): Promise<void> {
		const output = await projectActions.createNote(title, project.id);
		if (!output) {
			toast.error('Could not create the note. Try again.');
			return;
		}
		await goto(`/notes/${output.note.id}`);
	}

	async function createFolder(name: string): Promise<void> {
		const output = await projectActions.createFolder(project.id, name);
		if (!output) toast.error('Could not create the folder. Try again.');
	}

	async function rename(name: string): Promise<void> {
		const output = await projectActions.renameProject(project.id, name);
		if (!output) toast.error('Could not rename the project. Try again.');
	}

	async function archive(): Promise<void> {
		const output = await projectActions.archiveProject(project.id);
		if (!output) {
			toast.error('Could not archive the project. Try again.');
			return;
		}
		await goto('/');
	}
</script>

<div class="flex flex-wrap items-center gap-2">
	<Button variant="outline" size="sm" onclick={() => (newNoteOpen = true)}>
		<FilePlus class="size-4" />
		New note
	</Button>
	<Button variant="outline" size="sm" onclick={() => (newFolderOpen = true)}>
		<FolderPlus class="size-4" />
		New folder
	</Button>
	<Button variant="outline" size="sm" href="/projects/{project.id}/todos">
		<ListTodo class="size-4" />
		Todos
	</Button>
	<Button variant="outline" size="sm" onclick={() => rightPanel.openMemory(project.id)}>
		<Brain class="size-4" />
		Memory
	</Button>
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="ghost" size="icon-sm" aria-label="Project actions">
					<Ellipsis class="size-4" />
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="start">
			<DropdownMenu.Item onclick={() => (renameOpen = true)}>Rename project</DropdownMenu.Item>
			<DropdownMenu.Item variant="destructive" onclick={() => void archive()}>
				Archive project
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</div>

{#if view.tree.length === 0}
	<div
		class="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 text-center"
	>
		<p class="text-sm text-muted-foreground">This project is empty.</p>
		<Button size="sm" onclick={() => (newNoteOpen = true)}>
			<FilePlus class="size-4" />
			Create the first note
		</Button>
	</div>
{:else}
	<section class="flex flex-col gap-1" aria-label="Project contents">
		<p class="text-xs font-medium text-muted-foreground">
			{countEntries(view.tree)}
			{countEntries(view.tree) === 1 ? 'item' : 'items'}
		</p>
		<ul class="divide-y divide-border rounded-lg border border-border">
			{#each view.tree as node (node.entry.id)}
				<li>
					{#if node.entry.kind === 'folder'}
						<div class="flex items-center gap-2 px-3 py-2 text-sm">
							<Folder class="size-4 shrink-0 text-muted-foreground" />
							<span class="font-medium">{node.entry.title}</span>
							<span class="text-xs text-muted-foreground">
								{node.children.length}
								{node.children.length === 1 ? 'item' : 'items'}
							</span>
						</div>
					{:else}
						<a
							class="row-interactive flex items-center gap-2 px-3 py-2 text-sm"
							href="/notes/{node.entry.id}"
						>
							{#if node.entry.kind === 'skill'}
								<Wrench class="size-4 shrink-0 text-muted-foreground" />
							{:else}
								<FileText class="size-4 shrink-0 text-muted-foreground" />
							{/if}
							<span class="min-w-0 flex-1 truncate">{node.entry.title}</span>
							<span class="text-xs text-muted-foreground">
								{formatDateTime(node.entry.updatedAt)}
							</span>
						</a>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}

<NameDialog
	bind:open={newNoteOpen}
	title="New note"
	label="Note title"
	submitLabel="Create"
	busy={projectActions.busy}
	onsubmit={createNote}
/>
<NameDialog
	bind:open={newFolderOpen}
	title="New folder"
	label="Folder name"
	submitLabel="Create"
	busy={projectActions.busy}
	onsubmit={createFolder}
/>
<NameDialog
	bind:open={renameOpen}
	title="Rename project"
	label="Project name"
	initialValue={project.name}
	busy={projectActions.busy}
	onsubmit={rename}
/>
