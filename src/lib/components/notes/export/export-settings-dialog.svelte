<script lang="ts">
	import { untrack } from 'svelte';
	import { workspaceSession } from '$lib/factories/workspace/session';
	import type { WorkspaceDraftController } from '$lib/controllers/workspace/workspace';
	import type { ExportSettings } from '$lib/models/deliverables';
	import type { UserId } from '$lib/models/identity';
	import type { ProjectId } from '$lib/models/projects';
	import type { DateTime } from '$lib/models/workspace';
	import { defaultExportSettings } from '$lib/models/deliverables';
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import ExportSettingsFields from './export-settings-fields.svelte';

	let {
		open = $bindable(false),
		projectId
	}: {
		open?: boolean;
		projectId: string;
	} = $props();

	let settings = $state<ExportSettings>({ ...defaultExportSettings });
	let draft = $state<WorkspaceDraftController<'export_settings'> | null>(null);
	let busy = $state(false);
	const loaded = $derived(draft !== null);

	$effect(() => {
		if (!open) return;
		const id = projectId as ProjectId;
		let current = true;
		void untrack(() => load(id, () => current));
		return () => {
			current = false;
			draft = null;
		};
	});

	/** Open this project's defaults; a project without its own starts from the app defaults. */
	async function load(id: ProjectId, current: () => boolean): Promise<void> {
		const accountId = (await workspaceSession.start()).bootstrap.accountId as UserId;
		const timestamp = new Date().toISOString() as DateTime;
		const opened = await workspaceSession.openOrCreate(
			{ type: 'export_settings', id: [accountId, id] },
			{
				type: 'export_settings',
				value: {
					userId: accountId,
					projectId: id,
					settings: { ...defaultExportSettings },
					createdAt: timestamp,
					updatedAt: timestamp
				}
			}
		);
		if (!current()) return;
		if (opened.kind === 'failure') return void toast.error(opened.message);
		draft = opened.draft;
		settings = { ...defaultExportSettings, ...opened.value.settings };
	}

	async function save(): Promise<void> {
		const value = draft?.value;
		if (!draft || !value || busy) return;
		busy = true;
		const saved = await draft.stage({
			kind: 'updateExportSettings',
			userId: value.userId,
			projectId: value.projectId,
			settings: { ...settings }
		});
		busy = false;
		if (saved.kind === 'saved') {
			toast.success('Export defaults saved on this device');
			open = false;
		} else toast.error('Could not save the export defaults.');
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>Export defaults</Dialog.Title>
			<Dialog.Description>
				Default document layout for every export from this project.
			</Dialog.Description>
		</Dialog.Header>
		<ExportSettingsFields bind:settings disabled={busy || !loaded} />
		<Dialog.Footer>
			<Button type="button" variant="ghost" onclick={() => (open = false)}>Cancel</Button>
			<Button type="button" disabled={busy || !loaded} onclick={() => void save()}>
				{busy ? 'Saving…' : 'Save defaults'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
