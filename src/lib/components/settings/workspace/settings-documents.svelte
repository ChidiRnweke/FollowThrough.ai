<script lang="ts">
	import { createEditorSession } from '$lib/factories/workspace/editor-session';
	import { onMount } from 'svelte';
	import { workspaceSession } from '$lib/factories/workspace/session';
	import type { WorkspaceDraftController } from '$lib/controllers/workspace/workspace';
	import { createSettingsForm } from '$lib/factories/settings/settings-form';
	import type { SettingsForm } from '$lib/stores/settings/settings-form.svelte';
	import { Form } from '$lib/components/ui/form';
	import * as Field from '$lib/components/ui/field';
	import { Switch } from '$lib/components/ui/switch';
	import { toast } from 'svelte-sonner';
	import SettingsSaveBar from '../settings-save-bar.svelte';

	type DocumentSettings = { readonly sectionNumberingDefault: boolean };

	// The switch already shows what was chosen, so without a toast a save reads as dead.
	let form = $state<
		| { kind: 'loading' }
		| {
				kind: 'ready';
				draft: WorkspaceDraftController<'user_preferences'>;
				settings: SettingsForm<DocumentSettings>;
		  }
		| { kind: 'failure'; message: string }
	>({ kind: 'loading' });
	const editorSession = createEditorSession(() => form.kind === 'ready' && form.draft.active);
	const busy = $derived(editorSession.saving);
	onMount(() => {
		let cancelled = false;
		void workspaceSession
			.openPreferences('user_preferences')
			.then(({ draft, value }) => {
				if (cancelled) return;
				const settings = createSettingsForm<DocumentSettings>({
					sectionNumberingDefault: value.sectionNumberingDefault ?? false
				});
				form = { kind: 'ready', draft, settings };
			})
			.catch((error) => {
				const message = error instanceof Error ? error.message : 'Preferences could not be opened';
				if (!cancelled) form = { kind: 'failure', message };
				return { kind: 'failure', message };
			});
		return () => {
			cancelled = true;
			editorSession.close();
		};
	});
	async function save(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (form.kind !== 'ready' || busy || !form.settings.dirty) return;
		const value = form.draft.value;
		if (!value) {
			toast.error('Reopen these preferences before editing');
			return;
		}
		const { draft, settings } = form;
		const submitted = settings.values;
		// The session persists what was submitted; the form keeps any later edit as unsaved.
		editorSession.changed();
		await editorSession.save(
			() => draft.stage({ kind: 'updateUserPreferences', userId: value.userId, ...submitted }),
			() => settings.commit(submitted)
		);
		if (editorSession.failure) toast.error(editorSession.failure);
		else toast.success('Document defaults saved on this device');
	}
</script>

{#if form.kind === 'failure'}
	<p role="alert" class="text-sm text-destructive">{form.message}</p>
{:else if form.kind === 'loading'}
	<p role="status" class="text-sm text-muted-foreground">Loading preferences…</p>
{:else}
	{@const settings = form.settings}
	<Form onsubmit={save} class="flex max-w-3xl flex-col gap-group">
		<!-- The pb-2 steps the preamble out to 32px so it does not read as a caption of the fields. -->
		<p class="pb-2 text-sm text-muted-foreground">
			Defaults for how documents read. A project or a single document can still choose its own.
		</p>

		<Field.Group>
			<Field.Field orientation="responsive">
				<Field.Content>
					<Field.Title>Section numbering</Field.Title>
					<Field.Description>
						Number headings like a Word document: 1. for H1, 1.1 for H2, down to H4.
					</Field.Description>
				</Field.Content>
				<Switch
					aria-label="Section numbering"
					bind:checked={
						() => settings.values.sectionNumberingDefault,
						(next) => settings.set('sectionNumberingDefault', next)
					}
				/>
			</Field.Field>
		</Field.Group>
		<SettingsSaveBar dirty={settings.dirty} saving={busy} onundo={() => settings.undo()} />
	</Form>
{/if}
