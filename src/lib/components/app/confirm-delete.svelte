<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';

	let {
		title = 'Delete this item?',
		description = 'This cannot be undone.',
		confirmLabel = 'Delete',
		busy = false,
		onconfirm,
		trigger
	}: {
		title?: string;
		description?: string;
		confirmLabel?: string;
		busy?: boolean;
		onconfirm: () => void | Promise<void>;
		/** Rendered inside an AlertDialog.Trigger; receives the trigger props to spread. */
		trigger: Snippet<[Record<string, unknown>]>;
	} = $props();

	let open = $state(false);

	async function confirm(): Promise<void> {
		await onconfirm();
		open = false;
	}
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Trigger>
		{#snippet child({ props })}
			{@render trigger(props)}
		{/snippet}
	</AlertDialog.Trigger>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{title}</AlertDialog.Title>
			<AlertDialog.Description>{description}</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={busy}>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action variant="destructive" disabled={busy} onclick={() => void confirm()}>
				{confirmLabel}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
