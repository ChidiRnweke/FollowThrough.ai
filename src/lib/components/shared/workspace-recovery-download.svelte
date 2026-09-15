<script lang="ts">
	import { workspaceSession } from '$lib/stores/workspace/session.svelte';
	import { Button } from '$lib/components/ui/button';
	let {
		recovery = workspaceSession,
		reloaded = () => window.location.reload()
	}: {
		recovery?: Pick<typeof workspaceSession, 'downloadLocalWrites' | 'resetLocalWorkspace'>;
		reloaded?: () => void;
	} = $props();
	let failure = $state<string | null>(null);
	let busy = $state(false);
	let confirming = $state(false);
	async function download(): Promise<void | { kind: 'failure' }> {
		busy = true;
		failure = null;
		try {
			const blob = await recovery.downloadLocalWrites();
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = 'followthrough-workspace-backup.json';
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 0);
		} catch (error) {
			failure = error instanceof Error ? error.message : 'Saved data could not be exported';
			return { kind: 'failure' };
		} finally {
			busy = false;
		}
	}
	async function reset(): Promise<void | { kind: 'failure' }> {
		busy = true;
		failure = null;
		try {
			await recovery.resetLocalWorkspace();
			reloaded();
		} catch (error) {
			failure = error instanceof Error ? error.message : 'Saved data could not be reset';
			return { kind: 'failure' };
		} finally {
			busy = false;
		}
	}
</script>

<div class="mt-4 space-y-2">
	<div class="flex flex-wrap gap-3">
		<Button variant="link" class="px-0" disabled={busy} onclick={() => void download()}
			>Download saved data</Button
		>
		<Button variant="link" class="px-0" disabled={busy} onclick={() => (confirming = true)}
			>Reset this device…</Button
		>
	</div>
	{#if confirming}
		<div role="group" aria-label="Confirm workspace reset" class="space-y-2">
			<p class="text-sm">
				This removes this account’s downloaded content and unsent edits from this device, including
				other tabs. Download a copy first if you need to keep your local edits. Changes already
				saved to the server remain.
			</p>
			<div class="flex gap-3">
				<Button variant="outline" disabled={busy} onclick={() => (confirming = false)}
					>Cancel</Button
				>
				<Button variant="destructive" disabled={busy} onclick={() => void reset()}
					>Reset local workspace</Button
				>
			</div>
		</div>
	{/if}
	{#if failure}<p role="alert" class="text-sm text-destructive">{failure}</p>{/if}
</div>
