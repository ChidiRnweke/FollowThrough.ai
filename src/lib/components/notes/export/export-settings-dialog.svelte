<script lang="ts">
	import type { ExportSettings } from '$lib/models/deliverables';
	import { defaultExportSettings } from '$lib/models/deliverables';
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import ExportSettingsFields from './export-settings-fields.svelte';
	import {
		getExportSettings,
		updateExportSettings
	} from '$lib/remote/deliverables/deliverables.remote';

	let {
		open = $bindable(false),
		projectId
	}: {
		open?: boolean;
		projectId: string;
	} = $props();

	let settings = $state<ExportSettings>({ ...defaultExportSettings });
	let busy = $state(false);

	$effect(() => {
		if (open) void load();
	});

	async function load(): Promise<void> {
		try {
			settings = { ...(await getExportSettings(projectId)) };
		} catch {
			settings = { ...defaultExportSettings };
		}
	}

	async function save(): Promise<void> {
		busy = true;
		try {
			await updateExportSettings({ projectId, settings });
			toast.success('Export defaults saved');
			open = false;
		} catch {
			toast.error('Could not save the export defaults.');
		} finally {
			busy = false;
		}
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
		<ExportSettingsFields bind:settings disabled={busy} />
		<Dialog.Footer>
			<Button type="button" variant="ghost" onclick={() => (open = false)}>Cancel</Button>
			<Button type="button" disabled={busy} onclick={() => void save()}>
				{busy ? 'Saving…' : 'Save defaults'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
