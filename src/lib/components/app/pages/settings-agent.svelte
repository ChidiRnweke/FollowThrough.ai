<script lang="ts">
	import type { AgentExecutionMode, AgentModel, AgentPreferences } from '$lib/models';
	import ActionForm from '$lib/components/primitives/action-form.svelte';
	import ModelPicker from '$lib/components/app/agent/model-picker.svelte';
	import ExecutionModeControl from '$lib/components/app/agent/execution-mode-control.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';

	let { preferences, models }: { preferences: AgentPreferences; models: readonly AgentModel[] } =
		$props();
	let model = $state<string | null>(null);
	let mode = $state<AgentExecutionMode>('approval_required');
	$effect(() => {
		model = preferences.defaultModel ?? null;
		mode = preferences.executionMode;
	});
</script>

<ActionForm action="?/agentPreferences" class="max-w-3xl">
	<Field.Group>
		<Field.Field orientation="responsive">
			<Field.Content>
				<Field.Title>Default chat model</Field.Title>
				<Field.Description>Used when a conversation has no model override.</Field.Description>
			</Field.Content>
			<ModelPicker
				{models}
				bind:value={model}
				allowDefault
				defaultLabel="Use environment default"
			/>
			<Input type="hidden" name="defaultModel" value={model ?? ''} />
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
</ActionForm>
