<script lang="ts">
	import { Toaster as Sonner, type ToasterProps as SonnerProps } from 'svelte-sonner';
	import { mode } from 'mode-watcher';
	import {
		FtLoader as Loader2Icon,
		FtSuccess as CircleCheckIcon,
		FtError as OctagonXIcon,
		FtInfo as InfoIcon,
		FtWarning as TriangleAlertIcon,
		FtClose as XIcon
	} from '$lib/components/icons';

	// Every toast is dismissable: several of them report the outcome of a durable action and
	// there is no other way to clear one before its timer runs out. Sonner's own close button
	// paints itself from `--gray4`/`--gray12`, which ignores the token mapping below, so the
	// classes bring it back onto the popover palette.
	let { closeButton = true, toastOptions, ...restProps }: SonnerProps = $props();
	const options = $derived({
		...toastOptions,
		classes: {
			closeButton: 'border-border! bg-popover! text-muted-foreground! hover:text-foreground!',
			...toastOptions?.classes
		}
	});
</script>

<Sonner
	theme={mode.current}
	class="toaster group"
	style="--normal-bg: var(--color-popover); --normal-text: var(--color-popover-foreground); --normal-border: var(--color-border);"
	{closeButton}
	toastOptions={options}
	{...restProps}
>
	{#snippet loadingIcon()}
		<Loader2Icon class="size-4 animate-spin" />
	{/snippet}
	{#snippet successIcon()}
		<CircleCheckIcon class="size-4" />
	{/snippet}
	{#snippet errorIcon()}
		<OctagonXIcon class="size-4" />
	{/snippet}
	{#snippet infoIcon()}
		<InfoIcon class="size-4" />
	{/snippet}
	{#snippet warningIcon()}
		<TriangleAlertIcon class="size-4" />
	{/snippet}
	{#snippet closeIcon()}
		<XIcon class="size-3" />
	{/snippet}
</Sonner>
