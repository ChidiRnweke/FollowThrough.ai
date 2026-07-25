<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	let {
		title,
		description,
		header,
		breadcrumb,
		actions,
		fill = false,
		width = 'prose',
		class: className,
		children
	}: {
		title?: string;
		description?: string;
		header?: Snippet;
		breadcrumb?: Snippet;
		actions?: Snippet;
		fill?: boolean;
		/** `prose` is the reading measure. `wide` is for data surfaces (boards, tables)
		 *  that are starved by it; the header keeps the reading measure regardless. */
		width?: 'prose' | 'wide';
		class?: string;
		children: Snippet;
	} = $props();

	const wide = $derived(width === 'wide');
</script>

<div
	class={cn(
		'mx-auto flex w-full flex-col px-4 pt-6 pb-6 md:px-8',
		wide ? 'max-w-[100rem] gap-8' : 'max-w-5xl gap-6',
		fill && 'flex-1',
		className
	)}
>
	{#if header || breadcrumb || title || description || actions}
		<!-- The header keeps the reading measure even when the content below goes wide. -->
		<header class="flex w-full max-w-5xl flex-wrap items-start justify-between gap-3">
			{#if header}
				{@render header()}
			{:else}
				<!-- Spacing ladder, per DESIGN_SYSTEM.md "Grouping is spacing and similarity":
				     navigation sits a step away from identity, and title+description read as one unit. -->
				<div class="flex flex-col">
					{#if breadcrumb}
						{@render breadcrumb()}
					{/if}
					{#if title}
						<h1 class={cn('page-title', breadcrumb && 'mt-3')}>{title}</h1>
					{/if}
					{#if description}
						<p class="mt-1 text-sm text-muted-foreground">{description}</p>
					{/if}
				</div>
			{/if}
			{#if actions}
				<div class="flex w-full flex-wrap items-center gap-2 sm:w-auto">{@render actions()}</div>
			{/if}
		</header>
	{/if}
	{@render children()}
</div>
