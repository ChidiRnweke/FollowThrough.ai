<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import { NameDialog, ProjectOverview } from '$lib/components/projects';
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
	import { projectActions } from '$lib/stores/projects/project-actions.svelte';
	import { BulkExportDialog, ExportSettingsDialog, ImportNotesDialog } from '$lib/components/notes';
	import type { ProjectExportEntry } from '$lib/models/projects';
	import { projectExportEntries } from '$lib/models/projects';
	import { AgentAction, agentActions } from '$lib/components/agent';

	let { data } = $props();

	const project = $derived(data.view.project);
	let newNoteOpen = $state(false);
	let newFolderOpen = $state(false);
	let renameOpen = $state(false);
	let exportDefaultsOpen = $state(false);
	let importOpen = $state(false);
	let exportOpen = $state(false);
	let exportSourceTitle = $state('');
	let exportEntries = $state<readonly ProjectExportEntry[]>([]);

	// The whole project, folders preserved as folders inside the zip. A project with no
	// notes in it gets no menu item rather than a dialog with nothing to offer.
	const projectEntries = $derived(projectExportEntries(data.view.tree));

	function startExport(sourceTitle: string, entries: readonly ProjectExportEntry[]): void {
		exportSourceTitle = sourceTitle;
		exportEntries = entries;
		exportOpen = true;
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
		await goto('/today');
	}
</script>

{#key project.id}
	<PageShell title={project.name} description={project.description ?? undefined}>
		{#snippet actions()}
			<!-- Leftmost in every cluster in the app, so the agent always sits in the
			     same place relative to the screen's own buttons. -->
			<AgentAction action={agentActions.projectConnect} context={{ projectId: project.id }} />
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
					{#if projectEntries.length > 0}
						<DropdownMenu.Item onclick={() => startExport(project.name, projectEntries)}>
							Export documents…
						</DropdownMenu.Item>
					{/if}
					<DropdownMenu.Item onclick={() => (exportDefaultsOpen = true)}>
						Export defaults…
					</DropdownMenu.Item>
					<DropdownMenu.Item onclick={() => (importOpen = true)}>
						Import an existing project…
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
			onimport={() => (importOpen = true)}
			onexport={startExport}
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
<BulkExportDialog
	bind:open={exportOpen}
	projectId={project.id}
	sourceTitle={exportSourceTitle}
	entries={exportEntries}
/>
<ExportSettingsDialog bind:open={exportDefaultsOpen} projectId={project.id} />
<ImportNotesDialog bind:open={importOpen} projectId={project.id} destination={project.name} />
