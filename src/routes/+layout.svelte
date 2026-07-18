<script lang="ts">
	import './layout.css';
	import { ModeWatcher } from 'mode-watcher';
	import { Toaster } from '$lib/components/ui/sonner';

	let { children } = $props();
</script>

<svelte:head>
	<title>FollowThrough</title>
	<meta
		name="description"
		content="A focused workspace that turns notes into actions and carries work through to completion."
	/>
	<meta name="theme-color" content="#0f766e" />
	<link rel="manifest" href="/manifest.webmanifest" />
	<link rel="icon" type="image/svg+xml" href="/icons/followthrough.svg" />
	<link rel="apple-touch-icon" href="/icons/followthrough-apple-touch.png" />
</svelte:head>
<ModeWatcher />
<Toaster />
{@render children()}
