<script lang="ts">
	import type { AgentModel } from '$lib/models/agent';
	import { modelMetaLine, shortModelName } from '$lib/models/agent/model-label';
	import { Button } from '$lib/components/ui/button';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';
	import { FtCheck as Check, FtChevronsUd as ChevronsUpDown } from '$lib/components/icons';

	let {
		models,
		value = $bindable(null),
		allowDefault = false,
		defaultLabel = 'Use default',
		compact = false,
		disabled = false,
		requireTools = true,
		onchange
	}: {
		models: readonly AgentModel[];
		value?: string | null;
		allowDefault?: boolean;
		defaultLabel?: string;
		compact?: boolean;
		disabled?: boolean;
		/**
		 * The chat model must call tools, so a model that cannot is offered but
		 * unselectable. The inline and attachment pickers make plain completion
		 * calls and set this false — filtering them to tool-capable models would
		 * rule out exactly the small, fast models those paths want.
		 */
		requireTools?: boolean;
		onchange?: (value: string | null) => void;
	} = $props();

	let open = $state(false);
	const selected = $derived(models.find((model) => model.id === value));

	function select(next: string | null): void {
		value = next;
		open = false;
		onchange?.(next);
	}
</script>

<!--
	The vendor lives on the second line, not doubled into the title: OpenRouter names
	read "DeepSeek: DeepSeek V4 Flash", and the repeat cost enough width that two
	models in the same family truncated to the same string. No per-row `Recommended`
	badge either — the group heading above the rows already says it.
-->
{#snippet modelRow(model: AgentModel)}
	<Command.Item
		value={`${model.name} ${model.provider} ${model.id}`}
		disabled={requireTools && !model.supportsTools}
		onSelect={() => select(model.id)}
	>
		<Check class={value === model.id ? 'opacity-100' : 'opacity-0'} />
		<div class="min-w-0 flex-1">
			<p class="truncate">{shortModelName(model.name)}</p>
			<p class="truncate text-xs text-muted-foreground">{modelMetaLine(model)}</p>
		</div>
	</Command.Item>
{/snippet}

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				size={compact ? 'sm' : 'default'}
				class="max-w-64 justify-between"
				{disabled}
			>
				<span class="truncate"
					>{selected
						? shortModelName(selected.name)
						: allowDefault
							? defaultLabel
							: 'Select model'}</span
				>
				<ChevronsUpDown data-icon="inline-end" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-96 p-0" align="start">
		<Popover.Header class="sr-only">
			<Popover.Title>Select a chat model</Popover.Title>
			<Popover.Description>Search OpenRouter models that support tools.</Popover.Description>
		</Popover.Header>
		<Command.Root>
			<Command.Input placeholder="Search models…" />
			<Command.List class="max-h-80">
				<Command.Empty>No matching models.</Command.Empty>
				{#if allowDefault}
					<Command.Group heading="Conversation">
						<Command.Item value={defaultLabel} onSelect={() => select(null)}>
							<Check class={value === null ? 'opacity-100' : 'opacity-0'} />
							{defaultLabel}
						</Command.Item>
					</Command.Group>
					<Command.Separator />
				{/if}
				<Command.Group heading="Recommended">
					{#each models.filter((model) => model.recommended) as model (model.id)}
						{@render modelRow(model)}
					{/each}
				</Command.Group>
				<Command.Separator />
				<Command.Group heading="All models">
					{#each models as model (model.id)}
						{@render modelRow(model)}
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
