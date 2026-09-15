<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Tip } from '$lib/components/ui/tooltip';
	import { FtEdit as Pencil } from '$lib/components/icons';
	import InlineTitleInput from '$lib/components/shared/inline-title-input.svelte';

	let {
		title,
		busy = false,
		oncommit,
		onstart
	}: {
		title: string;
		busy?: boolean;
		onstart: () => void;
		oncommit: (title: string) => void | Promise<void>;
	} = $props();

	let editing = $state(false);

	let failure = $state<string | null>(null);
	async function commit(value: string): Promise<void | { kind: 'failure' }> {
		failure = null;
		try {
			if (value && value !== title) await oncommit(value);
			editing = false;
		} catch (error) {
			failure = error instanceof Error ? error.message : 'The title could not be saved';
			return { kind: 'failure' };
		}
	}
</script>

<div class="group/title flex min-w-0 flex-1 items-center gap-1">
	{#if editing}
		<InlineTitleInput
			initialValue={title === 'Untitled diagram' ? '' : title}
			label="Diagram title"
			onsubmit={commit}
			oncancel={() => (editing = false)}
		/>
		{#if failure}<p role="alert" class="text-sm text-destructive">{failure}</p>{/if}
	{:else}
		<h2 class="min-w-0 truncate text-sm font-medium">{title}</h2>
		<Tip text="Rename diagram">
			{#snippet children({ props })}
				<Button
					{...props}
					variant="ghost"
					size="icon-xs"
					class="size-11 shrink-0 transition-opacity sm:size-6 sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover/title:opacity-100"
					aria-label="Rename diagram"
					disabled={busy}
					onclick={() => {
						onstart();
						editing = true;
					}}
				>
					<Pencil />
				</Button>
			{/snippet}
		</Tip>
	{/if}
</div>
