<script lang="ts">
	import { Form } from '$lib/components/ui/form';
	import type { AgentModel, AgentPreferences } from '$lib/models/agent';
	import { saveModelPreferences } from '$lib/remote/settings/settings.remote';
	import ModelPicker from '$lib/components/agent/preferences/model-picker.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { toast } from 'svelte-sonner';

	let { preferences, models }: { preferences: AgentPreferences; models: readonly AgentModel[] } =
		$props();
	let model = $state<string | null>(null);
	let visionModel = $state<string | null>(null);
	let inlineModel = $state<string | null>(null);
	let attachmentVisionModel = $state<string | null>(null);
	const visionModels = $derived(models.filter((candidate) => candidate.supportsVision));
	let inlineSuggestionsEnabled = $state(true);
	$effect(() => {
		model = preferences.defaultModel ?? null;
		visionModel = preferences.defaultVisionModel ?? null;
		inlineModel = preferences.inlineModel ?? null;
		attachmentVisionModel = preferences.attachmentVisionModel ?? null;
		inlineSuggestionsEnabled = preferences.inlineSuggestionsEnabled;
	});

	// A chat model that reads images itself never consults the vision model, so
	// the picker below is disabled rather than left to imply otherwise. Falls back
	// to the recommended entry because that is what an unset default resolves to.
	const effectiveChatModel = $derived(
		models.find((candidate) => candidate.id === model) ??
			models.find((candidate) => candidate.recommended)
	);
	const chatModelSeesImages = $derived(effectiveChatModel?.supportsVision ?? false);

	// Nothing on this panel moves when it saves — the controls already show what was typed —
	// so without a toast the button reads as dead. `submit()` resolves false on a validation
	// issue and throws on a failed request; both are the same story to tell here.
	const enhanced = saveModelPreferences.enhance(async (form) => {
		try {
			if (await form.submit()) toast.success('Model defaults saved');
			else toast.error('Could not save model defaults. Check the values and try again.');
		} catch {
			toast.error('Could not save model defaults. Try again.');
		}
	});
</script>

<Form {...enhanced} class="flex max-w-3xl flex-col gap-6">
	<!-- The preamble carries the submit action on its row, like the scope row on the
	     tools panel, and the pb-2 steps the row out past the gap to the fields below. -->
	<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-2">
		<p class="text-sm text-muted-foreground">
			Choose the models the agent chats, sees, and completes with. Every setting left unset follows
			this deployment's default.
		</p>
		<Button type="submit">Save model defaults</Button>
	</div>

	<Field.Group>
		<Field.Field orientation="responsive">
			<Field.Content>
				<Field.Title>Default chat model</Field.Title>
				<Field.Description>Used when a conversation has no model override.</Field.Description>
			</Field.Content>
			<ModelPicker {models} bind:value={model} allowDefault defaultLabel="App default" />
			<!-- Plain named inputs, not `fields.x.as('hidden', …)`: these values are driven by the
				     controls above and change after first render, and the field name is all the schema
				     needs for a string. -->
			<Input type="hidden" name="defaultModel" value={model ?? ''} />
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
				bind:value={visionModel}
				allowDefault
				defaultLabel="App default"
				requireTools={false}
				disabled={chatModelSeesImages}
			/>
			<Input type="hidden" name="defaultVisionModel" value={visionModel ?? ''} />
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
				bind:value={attachmentVisionModel}
				allowDefault
				defaultLabel="App default"
				requireTools={false}
			/>
			<Input type="hidden" name="attachmentVisionModel" value={attachmentVisionModel ?? ''} />
		</Field.Field>
		<Field.Separator />
		<Field.Field orientation="responsive">
			<Field.Content>
				<Field.Title>Inline writing suggestions</Field.Title>
				<Field.Description>Show grounded ghost text while you write notes.</Field.Description>
			</Field.Content>
			<Switch aria-label="Inline writing suggestions" bind:checked={inlineSuggestionsEnabled} />
			<Input
				type="hidden"
				name="inlineSuggestionsEnabled"
				value={String(inlineSuggestionsEnabled)}
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
				bind:value={inlineModel}
				allowDefault
				defaultLabel="App default"
				requireTools={false}
				disabled={!inlineSuggestionsEnabled}
			/>
			<Input type="hidden" name="inlineModel" value={inlineModel ?? ''} />
		</Field.Field>
	</Field.Group>
</Form>
