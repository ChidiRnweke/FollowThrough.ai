<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import ProjectOverview from '$lib/components/app/pages/project-overview.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Tip } from '$lib/components/ui/tooltip';
	import { mergeProps } from '$lib/utils';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import {
		FtDocumentPlus as FilePlus,
		FtFolderPlus as FolderPlus,
		FtEllipsis as Ellipsis
	} from '$lib/components/icons';
	import { projectActions } from '$lib/stores/project-actions.svelte';
	import NameDialog from '$lib/components/app/name-dialog.svelte';
	import ExportSettingsDialog from '$lib/components/app/export-settings-dialog.svelte';

	let { data } = $props();

	const project = $derived(data.view.project);
	let newNoteOpen = $state(false);
	let newFolderOpen = $state(false);
	let renameOpen = $state(false);
	let exportDefaultsOpen = $state(false);

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

{#key project.id}
	<PageShell title={project.name} description={project.description ?? undefined}>
		{#snippet actions()}
			<Button size="sm" onclick={() => (newNoteOpen = true)}>
				<FilePlus class="size-4" />
				New note
			</Button>
			<Button variant="outline" size="sm" onclick={() => (newFolderOpen = true)}>
				<FolderPlus class="size-4" />
				New folder
			</Button>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props: menuProps })}
						<Tip text="Project actions">
							{#snippet children({ props: tipProps })}
								<Button
									{...mergeProps(menuProps, tipProps)}
									variant="ghost"
									size="icon-sm"
									aria-label="Project actions"
								>
									<Ellipsis class="size-4" />
								</Button>
							{/snippet}
						</Tip>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					<DropdownMenu.Item onclick={() => (renameOpen = true)}>Rename project</DropdownMenu.Item>
					<DropdownMenu.Item onclick={() => (exportDefaultsOpen = true)}>
						Export defaults…
					</DropdownMenu.Item>
					<DropdownMenu.Item variant="destructive" onclick={() => void archive()}>
						Archive project
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/snippet}
		<ProjectOverview
			view={data.view}
			counts={data.counts}
			overdueTodoCount={data.overdueTodoCount}
			tipSeed={data.tipSeed}
			renderedAt={data.renderedAt}
			oncreatenote={() => (newNoteOpen = true)}
		/>
	</PageShell>
{/key}

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
<ExportSettingsDialog bind:open={exportDefaultsOpen} projectId={project.id} />
