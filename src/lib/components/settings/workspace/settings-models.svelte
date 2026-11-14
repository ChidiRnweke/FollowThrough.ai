<script lang="ts">
	import { createEditorSession } from '$lib/factories/workspace/editor-session';
	import { onMount } from 'svelte';
	import { workspaceSession } from '$lib/factories/workspace/session';
	import type { WorkspaceDraftController } from '$lib/controllers/workspace/workspace';
	import { createSettingsForm } from '$lib/factories/settings/settings-form';
	import type { SettingsForm } from '$lib/stores/settings/settings-form.svelte';

	import { Form } from '$lib/components/ui/form';
	import type { AgentModel } from '$lib/models/agent';
	import { ModelPicker } from '$lib/components/agent';
	import * as Field from '$lib/components/ui/field';
	import { Switch } from '$lib/components/ui/switch';
	import { toast } from 'svelte-sonner';
	import SettingsSaveBar from '../settings-save-bar.svelte';

	type ModelSettings = {
		readonly defaultModel: string | null;
		readonly defaultVisionModel: string | null;
		readonly inlineModel: string | null;
		readonly attachmentVisionModel: string | null;
		readonly inlineSuggestionsEnabled: boolean;
	};

	let { models }: { models: readonly AgentModel[] } = $props();
	const visionModels = $derived(models.filter((candidate) => candidate.supportsVision));

	// A chat model that reads images itself never consults the vision model, so
	// the picker below is disabled rather than left to imply otherwise. Falls back
	// to the recommended entry because that is what an unset default resolves to.
	const seesImages = (model: string | null): boolean =>
		(
			models.find((candidate) => candidate.id === model) ??
			models.find((candidate) => candidate.recommended)
		)?.supportsVision ?? false;

	let form = $state<
		| { kind: 'loading' }
		| {
				kind: 'ready';
				draft: WorkspaceDraftController<'agent_preferences'>;
				settings: SettingsForm<ModelSettings>;
		  }
		| { kind: 'failure'; message: string }
	>({ kind: 'loading' });
	const editorSession = createEditorSession(() => form.kind === 'ready' && form.draft.active);
	const busy = $derived(editorSession.saving);
	onMount(() => {
		let cancelled = false;
		void workspaceSession
			.openPreferences('agent_preferences')
			.then(({ draft, value }) => {
				if (cancelled) return;
				const settings = createSettingsForm<ModelSettings>({
					defaultModel: value.defaultModel ?? null,
					defaultVisionModel: value.defaultVisionModel ?? null,
					inlineModel: value.inlineModel ?? null,
					attachmentVisionModel: value.attachmentVisionModel ?? null,
					inlineSuggestionsEnabled: value.inlineSuggestionsEnabled
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
		const patch = settings.values;
		// The session persists what was submitted; the form keeps any later edit as unsaved.
		editorSession.changed();
		await editorSession.save(
			() => draft.stage({ kind: 'updateAgentPreferences', userId: value.userId, patch }),
			() => settings.commit(patch)
		);
		if (editorSession.failure) toast.error(editorSession.failure);
		else toast.success('Model defaults saved on this device');
	}
</script>

{#if form.kind === 'failure'}
	<p role="alert" class="text-sm text-destructive">{form.message}</p>
{:else if form.kind === 'loading'}
	<p role="status" class="text-sm text-muted-foreground">Loading preferences…</p>
{:else}
	{@const settings = form.settings}
	{@const chatModelSeesImages = seesImages(settings.values.defaultModel)}
	<Form onsubmit={save} class="flex max-w-3xl flex-col gap-group">
		<!-- The pb-2 steps the preamble out to 32px so it does not read as a caption of the fields. -->
		<p class="pb-2 text-sm text-muted-foreground">
			Choose the models the agent chats, sees, and completes with. Every setting left unset follows
			this deployment's default.
		</p>

		<Field.Group>
			<Field.Field orientation="responsive">
				<Field.Content>
					<Field.Title>Default chat model</Field.Title>
					<Field.Description>Used when a conversation has no model override.</Field.Description>
				</Field.Content>
				<ModelPicker
					{models}
					bind:value={
						() => settings.values.defaultModel, (next) => settings.set('defaultModel', next)
					}
					allowDefault
					defaultLabel="App default"
				/>
			</Field.Field>
			<Field.Separator />
			<Field.Field orientation="responsive">
				<Field.Content>
					<Field.Title>Default vision model</Field.Title>
					<Field.Description
						>Describes chat images when the selected chat model cannot see them.</Field.Description
					>
					{#if chatModelSeesImages}
						<p class="provenance-caption pt-1">The chat model reads images directly.</p>
					{/if}
				</Field.Content>
				<ModelPicker
					models={visionModels}
					bind:value={
						() => settings.values.defaultVisionModel,
						(next) => settings.set('defaultVisionModel', next)
					}
					allowDefault
					defaultLabel="App default"
					requireTools={false}
					disabled={chatModelSeesImages}
				/>
			</Field.Field>
			<Field.Separator />
			<Field.Field orientation="responsive">
				<Field.Content>
					<Field.Title>Attachment reading model</Field.Title>
					<Field.Description
						>Reads uploaded images and runs OCR over scanned documents.</Field.Description
					>
				</Field.Content>
				<ModelPicker
					models={visionModels}
					bind:value={
						() => settings.values.attachmentVisionModel,
						(next) => settings.set('attachmentVisionModel', next)
					}
					allowDefault
					defaultLabel="App default"
					requireTools={false}
				/>
			</Field.Field>
			<Field.Separator />
			<Field.Field orientation="responsive">
				<Field.Content>
					<Field.Title>Inline writing suggestions</Field.Title>
					<Field.Description>Show grounded ghost text while you write notes.</Field.Description>
				</Field.Content>
				<Switch
					aria-label="Inline writing suggestions"
					bind:checked={
						() => settings.values.inlineSuggestionsEnabled,
						(next) => settings.set('inlineSuggestionsEnabled', next)
					}
				/>
			</Field.Field>
			<Field.Separator />
			<Field.Field orientation="responsive">
				<Field.Content>
					<Field.Title>Inline suggestion model</Field.Title>
					<Field.Description
						>Runs on every typing pause, so prefer a small, fast model. Tool support is not needed.</Field.Description
					>
				</Field.Content>
				<ModelPicker
					{models}
					bind:value={
						() => settings.values.inlineModel, (next) => settings.set('inlineModel', next)
					}
					allowDefault
					defaultLabel="App default"
					requireTools={false}
					disabled={!settings.values.inlineSuggestionsEnabled}
				/>
			</Field.Field>
		</Field.Group>
		<SettingsSaveBar dirty={settings.dirty} saving={busy} onundo={() => settings.undo()} />
	</Form>
{/if}
