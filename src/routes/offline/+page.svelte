<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
</script>

<svelte:head>
	<title>Offline · FollowThrough</title>
	<meta
		name="description"
		content="FollowThrough is offline. Reconnect to refresh your workspace."
	/>
</svelte:head>

<main class="grid min-h-dvh place-items-center bg-background px-6 py-12 text-foreground">
	<section class="w-full max-w-md border-t border-border pt-8" aria-labelledby="offline-title">
		<img
			src="/icons/followthrough.svg"
			alt=""
			class="mb-8 size-12 rounded-xl"
			width="48"
			height="48"
		/>
		<p class="mb-2 text-xs font-medium tracking-wide text-primary uppercase">FollowThrough</p>
		<h1 id="offline-title" class="page-title">You’re offline</h1>
		<p class="mt-4 max-w-sm leading-6 text-muted-foreground">
			Reconnect to refresh uncached workspace data. Notes you previously opened may still be
			available from the cached workspace.
		</p>
		<Button href="/" class="mt-8 min-h-11">
			<RefreshCw class="size-4" />
			Retry workspace
		</Button>
	</section>
</main>
