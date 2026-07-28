<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { FtRetry as Retry } from '$lib/components/icons';

	/**
	 * The last-resort net for routes outside the app shell (marketing, auth,
	 * offline). Under `handleRenderingErrors` a rendering error arrives as a prop
	 * rather than on `page` — see vite.config.ts and the SvelteKit errors docs.
	 */
	let { error }: { error: App.Error } = $props();
</script>

<svelte:head>
	<title>Something broke · FollowThrough</title>
</svelte:head>

<main class="grid min-h-dvh place-items-center bg-background px-6 py-12 text-foreground">
	<section class="w-full max-w-md border-t border-border pt-8" aria-labelledby="error-title">
		<img
			src="/icons/followthrough.svg"
			alt=""
			class="mb-8 size-12 rounded-xl"
			width="48"
			height="48"
		/>
		<p class="mb-2 text-xs font-medium tracking-wide text-primary uppercase">FollowThrough</p>
		<h1 id="error-title" class="page-title">This page didn't load</h1>
		<p class="mt-4 max-w-sm leading-6 text-muted-foreground">{error.message}</p>
		<div class="mt-8 flex items-center gap-2">
			<Button onclick={() => location.reload()} class="min-h-11">
				<Retry class="size-4" />
				Try again
			</Button>
			<Button href="/today" variant="ghost" class="min-h-11">Go to today</Button>
		</div>
	</section>
</main>
