<script lang="ts">
	import { workspaceSession } from '$lib/stores/workspace/session.svelte';
	import { loadExportSettings } from './load-settings';
	import type { ExportSettings } from '$lib/models/deliverables';
	import { defaultExportSettings } from '$lib/models/deliverables';
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import ExportSettingsFields from './export-settings-fields.svelte';
	import { updateExportSettings } from '$lib/remote/deliverables/deliverables.remote';

	let {
		open = $bindable(false),
		projectId
	}: {
		open?: boolean;
		projectId: string;
	} = $props();

	let settings = $state<ExportSettings>({ ...defaultExportSettings });
	let busy = $state(false);
	let settingsReady = $state(false);

	$effect(() => {
		if (open) void load();
	});

	async function load(): Promise<void> {
		settingsReady = false;
		try {
			settings = { ...(await loadExportSettings(projectId)) };
			settingsReady = true;
			// audit-allow: silent-catch — settings load failure is reported and the dialog remains editable.
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Export settings could not be loaded');
		}
	}

	async function save(): Promise<void> {
		if (!settingsReady) return;
		busy = true;
		try {
			await updateExportSettings({ projectId, settings });
			await workspaceSession.synchronize();
			toast.success('Export defaults saved');
			open = false;
			// audit-allow: silent-catch — save failure is reported and the dialog remains open with the entered values.
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
		<ExportSettingsFields bind:settings disabled={busy || !settingsReady} />
		<Dialog.Footer>
			<Button type="button" variant="ghost" onclick={() => (open = false)}>Cancel</Button>
			<Button type="button" disabled={busy || !settingsReady} onclick={() => void save()}>
				{busy ? 'Saving…' : 'Save defaults'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
