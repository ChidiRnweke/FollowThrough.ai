<script lang="ts">
	import type { WorkspaceDraft } from '$lib/stores/workspace/resources.svelte';
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
	import {
		sectionNumberingLevelFor,
		sectionNumberingOverrideFor,
		type SectionNumberingLevel
	} from '$lib/models/notes';
	import { AgentAction, agentActions } from '$lib/components/agent';

	let { data } = $props();

	const views = $derived(data.session.resources.views);
	const view = $derived(views.project(data.projectId));
	const project = $derived(view?.project);
	const todos = $derived(views.todos({ projectId: data.projectId, status: 'open' }));
	const counts = $derived({
		todos: todos.length,
		memory: views.memories(data.projectId).length,
		artifacts: views.artifacts(data.projectId).length,
		diagrams: views.diagrams(data.projectId).length,
		attachments: views.attachments({ kind: 'project', id: data.projectId }).length
	});
	const sectionNumberingAppDefault = $derived(
		views.get('user_preferences', data.session.bootstrap.accountId)?.sectionNumberingDefault ??
			false
	);
	const overdueTodoCount = $derived(
		todos.filter(({ todo }) => todo.dueDate !== undefined && todo.dueDate < data.today).length
	);
	let newNoteOpen = $state(false);
	let newFolderOpen = $state(false);
	let renameDraft = $state<WorkspaceDraft<'projects'> | null>(null);
	let exportDefaultsOpen = $state(false);
	let importOpen = $state(false);
	let exportOpen = $state(false);
	let exportSourceTitle = $state('');
	let exportEntries = $state<readonly ProjectExportEntry[]>([]);

	// The whole project, folders preserved as folders inside the zip. A project with no
	// notes in it gets no menu item rather than a dialog with nothing to offer.
	const projectEntries = $derived(view ? projectExportEntries(view.tree) : []);

	function startExport(sourceTitle: string, entries: readonly ProjectExportEntry[]): void {
		exportSourceTitle = sourceTitle;
		exportEntries = entries;
		exportOpen = true;
	}

	async function createNote(title: string): Promise<boolean> {
		const output = await projectActions.createNote(title, data.projectId);
		if (!output) {
			toast.error('Could not create the note. Try again.');
			return false;
		}
		await goto(`/notes/${output.note.id}`);
		return true;
	}

	async function createFolder(name: string): Promise<boolean> {
		const output = await projectActions.createFolder(data.projectId, name);
		if (!output) toast.error('Could not create the folder. Try again.');
		return Boolean(output);
	}

	async function rename(name: string): Promise<boolean> {
		if (!renameDraft) return false;
		const output = await projectActions.renameProject(renameDraft, name);
		if (!output) toast.error('Could not rename the project. Try again.');
		return Boolean(output);
	}

	async function archive(): Promise<void> {
		const output = await projectActions.archiveProject(data.projectId);
		if (!output) {
			toast.error('Could not archive the project. Try again.');
			return;
		}
		await goto('/today');
	}

	async function changeSectionNumberingDefault(level: SectionNumberingLevel): Promise<void> {
		const output = await projectActions.setSectionNumberingDefault(
			data.projectId,
			sectionNumberingOverrideFor(level)
		);
		if (!output) toast.error('Could not update the project default. Try again.');
	}
</script>

{#if view && project}
	{#key data.projectId}
		<PageShell title={project.name} description={project.description ?? undefined}>
			{#snippet actions()}
				<!-- Leftmost in every cluster in the app, so the agent always sits in the
			     same place relative to the screen's own buttons. -->
				<AgentAction action={agentActions.projectConnect} context={{ projectId: data.projectId }} />
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
						<DropdownMenu.Item
							onclick={() => (renameDraft = projectActions.editor('projects', data.projectId))}
							>Rename project</DropdownMenu.Item
						>
						<DropdownMenu.Sub>
							<DropdownMenu.SubTrigger>Section numbering</DropdownMenu.SubTrigger>
							<DropdownMenu.SubContent>
								<DropdownMenu.RadioGroup
									value={sectionNumberingLevelFor(project.sectionNumberingDefault)}
									onValueChange={(value) =>
										void changeSectionNumberingDefault(value as SectionNumberingLevel)}
								>
									<DropdownMenu.RadioItem value="on">On by default</DropdownMenu.RadioItem>
									<DropdownMenu.RadioItem value="off">Off by default</DropdownMenu.RadioItem>
									<DropdownMenu.RadioItem value="default">
										Use app default ({sectionNumberingAppDefault ? 'on' : 'off'})
									</DropdownMenu.RadioItem>
								</DropdownMenu.RadioGroup>
							</DropdownMenu.SubContent>
						</DropdownMenu.Sub>
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
				{view}
				{counts}
				trashed={views.trashedNotes(data.projectId)}
				trashedDiagrams={views.trashedDiagrams(data.projectId)}
				{overdueTodoCount}
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
		bind:open={
			() => renameDraft !== null,
			(open) => {
				if (!open) renameDraft = null;
			}
		}
		title="Rename project"
		label="Project name"
		initialValue={renameDraft?.value?.name ?? ''}
		busy={projectActions.busy}
		onsubmit={rename}
	/>
	<BulkExportDialog
		bind:open={exportOpen}
		projectId={data.projectId}
		sourceTitle={exportSourceTitle}
		entries={exportEntries}
	/>
	<ExportSettingsDialog bind:open={exportDefaultsOpen} projectId={data.projectId} />
	<ImportNotesDialog bind:open={importOpen} projectId={data.projectId} destination={project.name} />
{:else}<p>This project is no longer available.</p>{/if}
