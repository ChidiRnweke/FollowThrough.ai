<script lang="ts">
	import type { AgentExecutionMode, AgentModel, AgentPreferences } from '$lib/models';
	import { saveAgentPreferences } from '$lib/remote/settings.remote';
	import ModelPicker from '$lib/components/app/agent/model-picker.svelte';
	import ExecutionModeControl from '$lib/components/app/agent/execution-mode-control.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';

	let { preferences, models }: { preferences: AgentPreferences; models: readonly AgentModel[] } =
		$props();
	let model = $state<string | null>(null);
	let mode = $state<AgentExecutionMode>('approval_required');
	let inlineSuggestionsEnabled = $state(true);
	$effect(() => {
		model = preferences.defaultModel ?? null;
		mode = preferences.executionMode;
		inlineSuggestionsEnabled = preferences.inlineSuggestionsEnabled;
	});
</script>

<p class="mb-4 text-sm text-muted-foreground">
	Choose the default model and how durable actions are approved.
</p>

<form {...saveAgentPreferences} class="max-w-3xl">
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
		<Field.Field orientation="horizontal">
			<Button type="submit">Save agent defaults</Button>
		</Field.Field>
	</Field.Group>
</form>
