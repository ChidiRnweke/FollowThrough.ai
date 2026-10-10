<script lang="ts">
	import { untrack } from 'svelte';
	import { createProjectExportSettings } from '$lib/factories/deliverables/settings';
	const defaults = createProjectExportSettings();
	import type { ExportSettings } from '$lib/models/deliverables';
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
	const busy = $derived(defaults.busy);
	const loaded = $derived(defaults.ready);

	let viewGeneration = 0;
	$effect(() => {
		void defaults.sessionGeneration;
		void defaults.accountId;
		const generation = ++viewGeneration;
		if (!open) return;
		const id = projectId;
		void untrack(() => defaults.open(id)).then((result) => {
			if (generation !== viewGeneration) return;
			if (result.kind === 'ready') settings = { ...result.settings };
			else if (result.kind === 'failure') toast.error(result.message);
		});
		return () => {
			viewGeneration++;
			defaults.close();
		};
	});

	async function save(): Promise<void> {
		const generation = viewGeneration;
		const result = await defaults.save(settings);
		if (generation !== viewGeneration) return;
		if (result.kind === 'saved') {
			toast.success('Export defaults saved on this device');
			open = false;
		} else if (result.kind === 'failure') toast.error(result.message);
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
