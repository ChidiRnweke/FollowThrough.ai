<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	let {
		title,
		description,
		header,
		actions,
		fill = false,
		class: className,
		children
	}: {
		title?: string;
		description?: string;
		header?: Snippet;
		actions?: Snippet;
		fill?: boolean;
		class?: string;
		children: Snippet;
	} = $props();
</script>

<div
	class={cn(
		'mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-6 pb-6 md:px-8',
		fill && 'flex-1',
		className
	)}
>
	{#if header || title || description || actions}
		<header class="flex flex-wrap items-start justify-between gap-3">
			{#if header}
				{@render header()}
			{:else}
				<div class="flex flex-col gap-1">
					<h1 class="text-xl font-semibold tracking-tight">{title}</h1>
					{#if description}
						<p class="text-sm text-muted-foreground">{description}</p>
					{/if}
				</div>
			{/if}
			{#if actions}
				<div class="flex items-center gap-2">{@render actions()}</div>
			{/if}
		</header>
	{/if}
	{@render children()}
</div>
