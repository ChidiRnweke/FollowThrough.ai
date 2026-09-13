<script lang="ts">
	import { workspaceSession } from '$lib/stores/workspace/session.svelte';
	import { Button } from '$lib/components/ui/button';
	let failure = $state<string | null>(null);
	let busy = $state(false);
	async function download(): Promise<void | { kind: 'failure' }> {
		busy = true;
		failure = null;
		try {
			const blob = await workspaceSession.downloadLocalWrites();
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = 'followthrough-saved-edits.json';
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 0);
		} catch (error) {
			failure = error instanceof Error ? error.message : 'Saved edits could not be exported';
			return { kind: 'failure' };
		} finally {
			busy = false;
		}
	}
</script>

<div class="mt-4 space-y-2">
	<Button variant="link" class="px-0" disabled={busy} onclick={() => void download()}
		>Download saved edits</Button
	>
	{#if failure}<p role="alert" class="text-sm text-destructive">{failure}</p>{/if}
</div>
