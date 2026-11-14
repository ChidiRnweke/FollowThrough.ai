<script lang="ts">
	import * as Avatar from '$lib/components/ui/avatar';
	import type { ConnectorLogo } from '$lib/models/connectors';
	import { cn } from '$lib/utils';

	/**
	 * A connected service's own logo on its tile (ADR 0049): the vendor's
	 * recorded mark for a catalog entry, the icon a custom server published,
	 * or the first letter of its title. Third-party logos are content, so this
	 * is the only place they are drawn, and nothing animates them.
	 */
	let {
		logo,
		title,
		size = 'default',
		class: className
	}: {
		logo: ConnectorLogo;
		/** Spelled out by the monogram when there is no image, or the image fails to load. */
		title: string;
		size?: 'sm' | 'default' | 'lg';
		class?: string;
	} = $props();

	const src = $derived(
		logo.kind === 'catalog'
			? `/connector-logos/${logo.catalogId}.svg`
			: logo.kind === 'server_icon'
				? `/connectors/${logo.connectorId}/icon?v=${logo.checksum}`
				: undefined
	);
	const initial = $derived(title.trim().charAt(0).toUpperCase() || '?');
</script>

<Avatar.Root
	data-slot="connector-logo"
	class={cn(
		'rounded-md bg-logo-plate after:rounded-md after:border-logo-plate-ring',
		size === 'sm' && 'size-6',
		size === 'default' && 'size-9',
		size === 'lg' && 'size-12',
		className
	)}
>
	{#if src}
		<Avatar.Image {src} alt="" class="rounded-md object-contain p-1.5" />
	{/if}
	<Avatar.Fallback
		class={cn(
			'rounded-md bg-logo-plate font-medium text-logo-plate-foreground',
			size === 'sm' ? 'text-xs' : 'text-sm'
		)}
	>
		{initial}
	</Avatar.Fallback>
</Avatar.Root>
