<script lang="ts">
	import { toggleMode } from 'mode-watcher';
	import BrandMark from '$lib/components/shared/brand-mark.svelte';
	import { Button } from '$lib/components/ui/button';
	import { FtTheme as Theme } from '$lib/components/icons';

	let { children } = $props();

	const repository = 'https://github.com/ChidiRnweke/FollowThrough.ai';
	const description =
		'A notes editor you never have to brief. The agent already knows your project: its decisions, its constraints, and what you are waiting on.';
</script>

<svelte:head>
	<title>FollowThrough · a notes editor you never have to brief</title>
	<meta name="description" content={description} />
	<meta property="og:title" content="FollowThrough" />
	<meta property="og:description" content={description} />
	<meta property="og:type" content="website" />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<div class="flex min-h-dvh flex-col bg-background">
	<header class="border-b border-border">
		<div class="mx-auto flex w-full max-w-6xl items-center gap-2 px-6 py-4">
			<a href="/" class="tactile flex items-center gap-2 rounded-md" aria-label="FollowThrough">
				<BrandMark class="size-7 shrink-0" />
				<span class="text-base font-semibold tracking-tight">FollowThrough</span>
			</a>
			<div class="flex-1"></div>
			<Button variant="ghost" size="icon-sm" onclick={toggleMode} aria-label="Toggle theme">
				<Theme class="size-4" />
			</Button>
			<Button href={repository} variant="ghost" size="sm" target="_blank" rel="noreferrer">
				GitHub
			</Button>
			<Button href="/auth/login" size="sm">Sign in</Button>
		</div>
	</header>

	<main class="flex-1">
		{@render children()}
	</main>

	<footer class="border-t border-border">
		<div class="mx-auto flex w-full max-w-6xl items-center gap-4 px-6 py-10">
			<div class="flex min-w-0 flex-1 items-center gap-2">
				<BrandMark class="size-5 shrink-0" />
				<span class="text-sm font-medium">FollowThrough</span>
			</div>
			<a
				href={repository}
				target="_blank"
				rel="noreferrer"
				class="tactile rounded-md text-sm text-muted-foreground hover:text-foreground"
			>
				GitHub
			</a>
		</div>
	</footer>
</div>
