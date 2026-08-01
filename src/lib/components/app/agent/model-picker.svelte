<script lang="ts">
	import type { AgentModel } from '$lib/models';
	import { Badge } from '$lib/components/ui/badge';
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
		onchange
	}: {
		models: readonly AgentModel[];
		value?: string | null;
		allowDefault?: boolean;
		defaultLabel?: string;
		compact?: boolean;
		disabled?: boolean;
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
					>{selected?.name ?? (allowDefault ? defaultLabel : 'Select model')}</span
				>
				<ChevronsUpDown data-icon="inline-end" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-80 p-0" align="start">
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
						<Command.Item
							value={`${model.name} ${model.provider} ${model.id}`}
							disabled={!model.supportsTools}
							onSelect={() => select(model.id)}
						>
							<Check class={value === model.id ? 'opacity-100' : 'opacity-0'} />
							<div class="min-w-0 flex-1">
								<p class="truncate">{model.name}</p>
								<p class="truncate text-xs text-muted-foreground">
									{model.provider} · {model.contextLength?.toLocaleString() ?? '—'} tokens
								</p>
							</div>
							<Badge variant="secondary">Recommended</Badge>
						</Command.Item>
					{/each}
				</Command.Group>
				<Command.Separator />
				<Command.Group heading="All models">
					{#each models as model (model.id)}
						<Command.Item
							value={`${model.name} ${model.provider} ${model.id}`}
							disabled={!model.supportsTools}
							onSelect={() => select(model.id)}
						>
							<Check class={value === model.id ? 'opacity-100' : 'opacity-0'} />
							<div class="min-w-0 flex-1">
								<p class="truncate">{model.name}</p>
								<p class="truncate text-xs text-muted-foreground">
									{model.provider} · {model.capabilities.join(', ') || 'No tool support'}
								</p>
							</div>
						</Command.Item>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
