<script lang="ts">
	import { Form } from '$lib/components/ui/form';
	import type { AgentExecutionMode, AgentModel, AgentPreferences } from '$lib/models';
	import { saveAgentPreferences } from '$lib/remote/settings.remote';
	import ModelPicker from '$lib/components/app/agent/model-picker.svelte';
	import ExecutionModeControl from '$lib/components/app/agent/execution-mode-control.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { toast } from 'svelte-sonner';

	let { preferences, models }: { preferences: AgentPreferences; models: readonly AgentModel[] } =
		$props();
	let model = $state<string | null>(null);
	let visionModel = $state<string | null>(null);
	const visionModels = $derived(models.filter((candidate) => candidate.supportsVision));
	let mode = $state<AgentExecutionMode>('approval_required');
	let inlineSuggestionsEnabled = $state(true);
	$effect(() => {
		model = preferences.defaultModel ?? null;
		visionModel = preferences.defaultVisionModel ?? null;
		mode = preferences.executionMode;
		inlineSuggestionsEnabled = preferences.inlineSuggestionsEnabled;
	});

	// Nothing on this panel moves when it saves — the controls already show what was typed —
	// so without a toast the button reads as dead. `submit()` resolves false on a validation
	// issue and throws on a failed request; both are the same story to tell here.
	const enhanced = saveAgentPreferences.enhance(async (form) => {
		try {
			if (await form.submit()) toast.success('Agent defaults saved');
			else toast.error('Could not save agent defaults. Check the values and try again.');
		} catch {
			toast.error('Could not save agent defaults. Try again.');
		}
	});
</script>

<Form {...enhanced} class="flex max-w-3xl flex-col gap-6">
	<!-- The preamble carries the submit action on its row, like the scope row on the
	     tools panel, and the pb-2 steps the row out past the gap to the fields below. -->
	<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-2">
		<p class="text-sm text-muted-foreground">
			Choose the default model and how durable actions are approved.
		</p>
		<Button type="submit">Save agent defaults</Button>
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
			</Field.Content>
			<ModelPicker
				models={visionModels}
				bind:value={visionModel}
				allowDefault
				defaultLabel="App default"
			/>
			<Input type="hidden" name="defaultVisionModel" value={visionModel ?? ''} />
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
				<Field.Title>Default execution mode</Field.Title>
				<Field.Description
					>Approval required pauses durable changes for review. Auto-accept applies agent changes
					immediately.</Field.Description
				>
			</Field.Content>
			<ExecutionModeControl bind:value={mode} />
			<Input type="hidden" name="executionMode" value={mode} />
		</Field.Field>
	</Field.Group>
</Form>
