<script lang="ts">
	import { workspaceSession } from '$lib/stores/workspace/session.svelte';
	import type { ExportSettings } from '$lib/models/deliverables';
	import { defaultExportSettings } from '$lib/models/deliverables';
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import ExportSettingsFields from './export-settings-fields.svelte';
	import type { WorkspaceDraft } from '$lib/stores/workspace/resources.svelte';
	import type { DateTime } from '$lib/models/workspace';
	import type { ProjectId } from '$lib/models/projects';
	import { workspaceResourceKey } from '$lib/models/workspace-sync';

	let {
		open = $bindable(false),
		projectId
	}: {
		open?: boolean;
		projectId: string;
	} = $props();

	let settings = $state<ExportSettings>({ ...defaultExportSettings });
	let busy = $state(false);
	let loaded = $state<WorkspaceDraft<'export_settings'> | null>(null);

	$effect(() => {
		loaded = null;
		if (!open) return;
		const id = projectId;
		let cancelled = false;
		void load(id)
			.then((draft) => {
				if (cancelled) return;
				const value = draft.value;
				if (!value) throw new Error('The export defaults are unavailable');
				settings = { ...defaultExportSettings, ...value.settings };
				loaded = draft;
			})
			.catch((error) => {
				const message =
					error instanceof Error ? error.message : 'Export defaults could not be loaded';
				if (!cancelled) toast.error(message);
				return { kind: 'failure', message };
			});
		return () => {
			cancelled = true;
		};
	});

	async function load(id: string): Promise<WorkspaceDraft<'export_settings'>> {
		const session = await workspaceSession.start();
		const draft = session.resources.draft({
			type: 'export_settings',
			id: [session.bootstrap.accountId, id]
		});
		const timestamp = new Date().toISOString() as DateTime;
		const opened = await draft.readOrCreate({
			type: 'export_settings',
			value: {
				userId: session.shell.user.id,
				projectId: id as ProjectId,
				settings: { ...defaultExportSettings },
				createdAt: timestamp,
				updatedAt: timestamp
			}
		});
		if (opened.kind !== 'ready')
			throw new Error(draft.lastError ?? 'The export defaults are unavailable');
		return draft;
	}

	async function save(): Promise<void> {
		const draft = loaded;
		const value = draft?.value;
		if (!draft || !value || busy) return;
		busy = true;
		try {
			const result = await draft.stage({
				command: {
					kind: 'updateExportSettings',
					userId: value.userId,
					projectId: value.projectId,
					settings: { ...settings }
				},
				local: { type: 'export_settings', value: { ...value, settings: { ...settings } } },
				coalesce: null,
				references: [workspaceResourceKey({ type: 'projects', id: [value.projectId] })]
			});
			if (result.kind === 'failure') throw new Error(result.message);
			toast.success('Export defaults saved on this device');
			if (loaded === draft) open = false;
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
		<ExportSettingsFields bind:settings disabled={busy || !loaded} />
		<Dialog.Footer>
			<Button type="button" variant="ghost" onclick={() => (open = false)}>Cancel</Button>
			<Button type="button" disabled={busy || !loaded} onclick={() => void save()}>
				{busy ? 'Saving…' : 'Save defaults'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
