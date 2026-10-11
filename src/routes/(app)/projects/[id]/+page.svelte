<script lang="ts">
	import { workspaceViews } from '$lib/factories/workspace/session';
	import type { WorkspaceDraftController } from '$lib/controllers/workspace/workspace';
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import { NameDialog, ProjectOverview } from '$lib/components/projects';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Tip } from '$lib/components/ui/tooltip';
	import { mergeProps } from '$lib/utils';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import * as Icon from '$lib/components/icons';
	import { workspaceSession } from '$lib/factories/workspace/session';
	import { BulkExportDialog, ExportSettingsDialog, ImportNotesDialog } from '$lib/components/notes';
	import type { ProjectExportEntry } from '$lib/models/projects';
	import { projectTreeController } from '$lib/factories/projects/tree';
	import {
		sectionNumberingSettings,
		type NoteId,
		type SectionNumberingLevel
	} from '$lib/models/notes';
	import { noteDocuments } from '$lib/factories/notes/document-presentation';
	import { AgentAction, agentActions } from '$lib/components/agent';

	let { data } = $props();

	const views = $derived(workspaceViews);
	const view = $derived(views.project(data.projectId));
	const project = $derived(view?.project);
	const todos = $derived(views.todos({ projectId: data.projectId, status: 'open' }));
	const counts = $derived({
		todos: todos.length,
		memory: views.memories(data.projectId).length,
		artifacts: views.artifacts(data.projectId).length,
		diagrams: views.diagrams(data.projectId).length,
		widgets: views.widgets(data.projectId).length,
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
	let renameDraft = $state<WorkspaceDraftController<'projects'> | null>(null);
	let busy = $state(false);
	async function action<T>(work: () => Promise<T>): Promise<T> {
		busy = true;
		try {
			return await work();
		} finally {
			busy = false;
		}
	}
	const projectIdentity = $derived({ type: 'projects' as const, id: [data.projectId] as [string] });
	let exportDefaultsOpen = $state(false);
	let importOpen = $state(false);
	let exportOpen = $state(false);
	let exportSourceTitle = $state('');
	let exportEntries = $state<readonly ProjectExportEntry[]>([]);

	// The whole project, folders preserved as folders inside the zip. A project with no
	// notes in it gets no menu item rather than a dialog with nothing to offer.
	const projectEntries = $derived(view ? projectTreeController.exportEntries(view.tree) : []);

	function startExport(sourceTitle: string, entries: readonly ProjectExportEntry[]): void {
		exportSourceTitle = sourceTitle;
		exportEntries = entries;
		exportOpen = true;
	}

	async function createNote(title: string): Promise<boolean> {
		const id = crypto.randomUUID() as NoteId;
		const created = await action(() =>
			workspaceSession.create({ kind: 'createNote', id, projectId: data.projectId, title })
		);
		if (created.kind === 'failure') {
			toast.error('Could not create the note. Try again.');
			return false;
		}
		await goto(`/notes/${id}`);
		return true;
	}

	async function createFolder(name: string): Promise<boolean> {
		const created = await action(() =>
			workspaceSession.create({
				kind: 'createFolder',
				id: crypto.randomUUID() as NoteId,
				projectId: data.projectId,
				name
			})
		);
		if (created.kind === 'failure') toast.error('Could not create the folder. Try again.');
		return created.kind === 'saved';
	}

	async function rename(name: string): Promise<boolean> {
		const draft = renameDraft;
		if (!draft) return false;
		const renamed = await action(() =>
			draft.stage({ kind: 'renameProject', projectId: data.projectId, name })
		);
		if (renamed.kind === 'failure') toast.error('Could not rename the project. Try again.');
		return renamed.kind === 'saved';
	}

	async function archive(): Promise<void> {
		const archived = await workspaceSession.edit(projectIdentity, {
			kind: 'archiveProject',
			projectId: data.projectId
		});
		if (archived.kind === 'failure') {
			toast.error('Could not archive the project. Try again.');
			return;
		}
		await goto('/today');
	}

	async function changeSectionNumberingDefault(level: SectionNumberingLevel): Promise<void> {
		const changed = await workspaceSession.edit(projectIdentity, {
			kind: 'projectNumbering',
			projectId: data.projectId,
			enabled: sectionNumberingSettings[level]
		});
		if (changed.kind === 'failure') toast.error('Could not update the project default. Try again.');
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
					<Icon.DocumentPlus class="size-4" />
					New note
				</Button>
				<Button variant="outline" size="sm" onclick={() => (newFolderOpen = true)}>
					<Icon.FolderPlus class="size-4" />
					New folder
				</Button>
				<!-- A link, not a summary: what the agent used is a server read, and the overview
				     should not pay for it on every visit. -->
				<Button variant="outline" size="sm" href="/projects/{data.projectId}/agent-activity">
					<Icon.Activity class="size-4" />
					Agent activity
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
										<Icon.Ellipsis class="size-4" />
									</Button>
								{/snippet}
							</Tip>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end">
						<DropdownMenu.Item
							onclick={() => (renameDraft = workspaceSession.capture(projectIdentity))}
							>Rename project</DropdownMenu.Item
						>
						<DropdownMenu.Sub>
							<DropdownMenu.SubTrigger>Section numbering</DropdownMenu.SubTrigger>
							<DropdownMenu.SubContent>
								<DropdownMenu.RadioGroup
									value={noteDocuments.numberingLevel(project.sectionNumberingDefault)}
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
				trashInventoryReady={data.session.resources.collectionReadiness() === 'ready'}
				trashed={views.trashedNotes(data.projectId)}
				trashedDiagrams={views.trashedDiagrams(data.projectId)}
				trashedWidgets={views.trashedWidgets(data.projectId)}
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
		{busy}
		onsubmit={createNote}
	/>
	<NameDialog
		bind:open={newFolderOpen}
		title="New folder"
		label="Folder name"
		submitLabel="Create"
		{busy}
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
		{busy}
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
