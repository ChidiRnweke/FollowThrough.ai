<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { RouteReadiness } from '$lib/client/sync/route-access';
	import { goto, invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	let { ready, children }: { ready: Promise<RouteReadiness>; children: Snippet } = $props();
	let settled = $state<{ request: Promise<RouteReadiness>; result: RouteReadiness } | null>(null);
	const result = $derived(settled?.request === ready ? settled.result : null);
	$effect(() => {
		const pending = ready;
		let active = true;

		void pending.then((value) => {
			if (active) settled = { request: pending, result: value };
		});
		return () => {
			active = false;
		};
	});
	$effect(() => {
		if (result?.kind === 'redirect') void goto(result.location, { replaceState: true });
	});
</script>

{#if result?.kind === 'ready'}
	{@render children()}
{:else if result?.kind === 'failure'}
	<div class="space-y-4 p-6 md:p-8" role="alert">
		<p class="text-sm font-medium">
			{result.status === 404
				? 'Item not found'
				: result.status === 410
					? 'Item deleted'
					: 'This screen could not be loaded'}
		</p>
		<p class="text-sm text-muted-foreground">{result.message}</p>
		<Button variant="outline" onclick={() => void invalidateAll()}>Try again</Button>
	</div>
{:else}
	<p class="p-6 md:p-8 text-sm text-muted-foreground" role="status">Loading this screen…</p>
{/if}
