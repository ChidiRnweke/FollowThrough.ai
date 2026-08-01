<script lang="ts">
	import type { AgentModel } from '$lib/models/agent';
	import { mergeProps } from 'bits-ui';
	import { Button } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import { Tip } from '$lib/components/ui/tooltip';
	import { FtSettings as Settings } from '$lib/components/icons';
	import { chat } from '$lib/stores/agent/chat.svelte';
	import ModelPicker from './model-picker.svelte';

	let { agentModels }: { agentModels: readonly AgentModel[] } = $props();
	const effectiveChatModel = $derived(
		agentModels.find((model) => model.id === chat.modelOverride) ??
			agentModels.find((model) => model.recommended)
	);
	const visionModels = $derived(agentModels.filter((model) => model.supportsVision));
</script>

<!--
	Model choice and prompt preferences are set once and then forgotten, so they
	live behind the gear rather than costing a permanent row above the composer.
	Execution mode deliberately stays in the composer instead: it decides whether
	the agent may write without asking, and that is not a preference to hide.
-->
<Popover.Root>
	<Popover.Trigger>
		{#snippet child({ props: triggerProps })}
			<Tip text="Agent settings">
				{#snippet children({ props: tipProps })}
					<Button
						{...mergeProps(triggerProps, tipProps)}
						variant="ghost"
						size="icon-sm"
						aria-label="Agent settings"
					>
						<Settings data-icon />
					</Button>
				{/snippet}
			</Tip>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content align="end" class="w-72 gap-3">
		<Popover.Header>
			<Popover.Title>Agent settings</Popover.Title>
		</Popover.Header>
		<div class="flex flex-col gap-1.5">
			<span class="text-xs text-muted-foreground">Model</span>
			<ModelPicker models={agentModels} bind:value={chat.modelOverride} allowDefault />
		</div>
		<div class="flex flex-col gap-1.5">
			<span class="text-xs text-muted-foreground">Vision model</span>
			<ModelPicker
				models={visionModels}
				bind:value={chat.visionModelOverride}
				allowDefault
				disabled={effectiveChatModel?.supportsVision ?? false}
			/>
			{#if effectiveChatModel?.supportsVision}
				<p class="text-xs text-muted-foreground">The chat model reads images directly.</p>
			{/if}
		</div>
		<Button variant="outline" size="sm" href="/settings">Defaults and prompt preferences</Button>
	</Popover.Content>
</Popover.Root>
