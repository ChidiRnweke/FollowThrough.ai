<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import { Button } from '$lib/components/ui/button';
	import { FtRetry as Retry } from '$lib/components/icons';

	/**
	 * Sits inside the app shell, so the sidebar, tabs and right panel stay usable
	 * while one screen is down. This is the level `handleRenderingErrors` wraps —
	 * without a `+error.svelte` here, a render throw anywhere under `(app)` takes
	 * the whole document instead.
	 *
	 * The error arrives as a prop, not on `page`: rendering errors happen after
	 * the page object is settled, and several boundaries can catch in parallel.
	 */
	let { error }: { error: App.Error } = $props();
</script>

<PageShell title="This screen didn't load" description={error.message}>
	<div class="flex items-center gap-2">
		<Button onclick={() => location.reload()}>
			<Retry data-icon="inline-start" />
			Try again
		</Button>
		<Button href="/today" variant="ghost">Go to today</Button>
	</div>
	{#if error.code}
		<p class="font-mono text-xs text-muted-foreground">{error.code}</p>
	{/if}
</PageShell>
