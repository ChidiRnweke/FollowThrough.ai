<script lang="ts">
	import { Command as CommandPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';
	import * as InputGroup from '$lib/components/ui/input-group/index.js';
	import { FtSearch as SearchIcon } from '$lib/components/icons';

	let {
		ref = $bindable(null),
		class: className,
		value = $bindable(''),
		...restProps
	}: CommandPrimitive.InputProps = $props();
</script>

<div data-slot="command-input-wrapper" class="p-1 pb-0">
	<InputGroup.Root class="h-9">
		<!--
			No `data-slot` here. It reaches the `<input>` through bits-ui's child props and used to
			land on top of `input-group-control`, which is the attribute the group's whole focus
			recipe selects on — so the teal border, halo and wash never fired for any Command field.
			Nothing selects a `command-input` slot; the wrapper above is the hook.
		-->
		<CommandPrimitive.Input
			{value}
			class={cn(
				'w-full text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50',
				className
			)}
			{...restProps}
		>
			{#snippet child({ props })}
				<InputGroup.Input {...props} bind:value bind:ref />
			{/snippet}
		</CommandPrimitive.Input>
		<InputGroup.Addon>
			<!-- No `opacity-50`: it dulls the addon's teal focus colour back to grey. -->
			<SearchIcon class="size-4 shrink-0" />
		</InputGroup.Addon>
	</InputGroup.Root>
</div>
