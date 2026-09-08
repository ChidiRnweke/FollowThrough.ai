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
</svelte:head>
<ModeWatcher />
<Toaster />
{@render children()}
