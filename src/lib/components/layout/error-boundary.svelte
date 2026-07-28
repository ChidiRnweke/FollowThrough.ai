<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { FtWarning as Warning, FtRetry as Retry } from '$lib/components/icons';
	import { cn } from '$lib/utils';

	/**
	 * Walls off one rendering surface so a throw inside it degrades in place instead
	 * of taking the page — or the whole app — with it.
	 *
	 * Wrap the *innermost* unit that can fail (one message, one diagram, one panel)
	 * rather than a whole screen: `<svelte:boundary>` removes its content when it
	 * catches, so a boundary drawn too wide leaves a blank, unusable surface. Pass
	 * `source` wherever the raw input is more useful than nothing.
	 *
	 * Reporting is deliberately absent here. `handleRenderingErrors` is on
	 * (see vite.config.ts), which routes every boundary error through
	 * `handleError` in hooks.client.ts first — an `onerror` here would double-report.
	 * That is also why `error` arrives as `App.Error` rather than a raw `Error`.
	 */
	let {
		label = 'this content',
		source,
		fallback,
		class: className,
		children
	}: {
		/** Completes "Couldn't display …" — e.g. `'this diagram'`. */
		label?: string;
		/** Raw input to show as the degraded rendering. Omitted means notice-only. */
		source?: string;
		/** Full control over the fallback. Receives the error and a retry callback. */
		fallback?: Snippet<[App.Error, () => void]>;
		class?: string;
		children: Snippet;
	} = $props();
</script>

<svelte:boundary>
	{@render children()}

	{#snippet failed(error, reset)}
		<!-- Svelte types this `unknown` because a bare boundary can catch anything.
		     Here it is always `App.Error`: `handleRenderingErrors` routes every
		     boundary error through `handleError` first. -->
		{@const failure = error as App.Error}
		{#if fallback}
			{@render fallback(failure, reset)}
		{:else}
			<div
				class={cn(
					'my-2 flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs',
					className
				)}
				role="alert"
			>
				<div class="flex items-start gap-2 text-destructive">
					<Warning class="mt-px size-3.5 shrink-0" />
					<span>
						Couldn't display {label}.
						{source === undefined ? 'Nothing else was affected.' : 'Showing the raw content.'}
					</span>
				</div>
				{#if source !== undefined}
					<pre
						class="max-h-80 overflow-auto rounded-sm bg-muted/50 p-2 font-mono leading-relaxed whitespace-pre-wrap text-muted-foreground">{source}</pre>
				{/if}
				<div class="flex items-center gap-2">
					<Button variant="ghost" size="xs" onclick={reset}>
						<Retry data-icon="inline-start" />
						Try again
					</Button>
					<span class="truncate text-muted-foreground">{failure.message}</span>
				</div>
			</div>
		{/if}
	{/snippet}
</svelte:boundary>
