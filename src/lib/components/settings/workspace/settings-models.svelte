<script lang="ts">
	import { EditorSession } from '$lib/stores/workspace/editor-session.svelte';
	import { onMount } from 'svelte';
	import { openPreferenceDraft } from '$lib/stores/workspace/account-preferences';
	import type { WorkspaceDraft } from '$lib/stores/workspace/resources.svelte';

	import { Form } from '$lib/components/ui/form';
	import type { AgentModel } from '$lib/models/agent';
	import { ModelPicker } from '$lib/components/agent';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { Switch } from '$lib/components/ui/switch';
	import { toast } from 'svelte-sonner';

	let { models }: { models: readonly AgentModel[] } = $props();
	let model = $state<string | null>(null);
	let visionModel = $state<string | null>(null);
	let inlineModel = $state<string | null>(null);
	let attachmentVisionModel = $state<string | null>(null);
	const visionModels = $derived(models.filter((candidate) => candidate.supportsVision));
	let inlineSuggestionsEnabled = $state(true);

	// A chat model that reads images itself never consults the vision model, so
	// the picker below is disabled rather than left to imply otherwise. Falls back
	// to the recommended entry because that is what an unset default resolves to.
	const effectiveChatModel = $derived(
		models.find((candidate) => candidate.id === model) ??
			models.find((candidate) => candidate.recommended)
	);
	const chatModelSeesImages = $derived(effectiveChatModel?.supportsVision ?? false);

	let form = $state<
		| { kind: 'loading' }
		| { kind: 'ready'; draft: WorkspaceDraft<'agent_preferences'> }
		| { kind: 'failure'; message: string }
	>({ kind: 'loading' });
	const editorSession = new EditorSession(() => form.kind === 'ready' && form.draft.active);
	const busy = $derived(editorSession.saving);
	onMount(() => {
		let cancelled = false;
		void openPreferenceDraft('agent_preferences')
			.then(({ draft, value }) => {
				if (cancelled) return;
				model = value.defaultModel ?? null;
				visionModel = value.defaultVisionModel ?? null;
				inlineModel = value.inlineModel ?? null;
				attachmentVisionModel = value.attachmentVisionModel ?? null;
				inlineSuggestionsEnabled = value.inlineSuggestionsEnabled;
				form = { kind: 'ready', draft };
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
		if (form.kind !== 'ready' || busy) return;
		const value = form.draft.value;
		if (!value) {
			toast.error('Reopen these preferences before editing');
			return;
		}
		const draft = form.draft;
		if (!editorSession.dirty) return;
		await editorSession.save(
			() =>
				draft.stage({
					kind: 'updateAgentPreferences',
					userId: value.userId,
					patch: {
						defaultModel: model,
						defaultVisionModel: visionModel,
						inlineModel,
						attachmentVisionModel,
						inlineSuggestionsEnabled
					}
				}),
			() => undefined
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
	<Form onsubmit={save} class="flex max-w-3xl flex-col gap-6">
		<!-- The preamble carries the submit action on its row, like the scope row on the
	     tools panel, and the pb-2 steps the row out past the gap to the fields below. -->
		<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-2">
			<p class="text-sm text-muted-foreground">
				Choose the models the agent chats, sees, and completes with. Every setting left unset
				follows this deployment's default.
			</p>
			<Button type="submit" disabled={busy}>Save model defaults</Button>
		</div>

		<Field.Group>
			<Field.Field orientation="responsive">
				<Field.Content>
					<Field.Title>Default chat model</Field.Title>
					<Field.Description>Used when a conversation has no model override.</Field.Description>
				</Field.Content>
				<ModelPicker
					{models}
					bind:value={
						() => model,
						(next) => {
							model = next;
							editorSession.changed();
						}
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
						() => visionModel,
						(next) => {
							visionModel = next;
							editorSession.changed();
						}
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
						() => attachmentVisionModel,
						(next) => {
							attachmentVisionModel = next;
							editorSession.changed();
						}
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
						() => inlineSuggestionsEnabled,
						(next) => {
							inlineSuggestionsEnabled = next;
							editorSession.changed();
						}
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
						() => inlineModel,
						(next) => {
							inlineModel = next;
							editorSession.changed();
						}
					}
					allowDefault
					defaultLabel="App default"
					requireTools={false}
					disabled={!inlineSuggestionsEnabled}
				/>
			</Field.Field>
		</Field.Group>
	</Form>
{/if}
