<script lang="ts">
	import type { DiagramSuggestion } from '$lib/models/diagrams';
	import * as Dialog from '$lib/components/ui/dialog';
	import DrawioEmbed from './drawio-embed.svelte';
	import type { DrawioExport } from '$lib/client/diagrams/drawio/embed-adapter';

	let {
		open = $bindable(false),
		suggestion,
		onaccept
	}: {
		open?: boolean;
		suggestion: DiagramSuggestion;
		onaccept: (output: DrawioExport) => Promise<void>;
	} = $props();
	let modified = $state(false);

	async function accept(output: DrawioExport): Promise<void> {
		await onaccept(output);
		open = false;
	}

	function changeOpen(nextOpen: boolean): void {
		if (!nextOpen && modified && !window.confirm('Leave without saving your diagram changes?')) {
			open = true;
			return;
		}
		open = nextOpen;
	}
</script>

<Dialog.Root {open} onOpenChange={changeOpen}>
	<Dialog.Content
		showCloseButton={false}
		class="flex h-11/12 max-w-6xl flex-col gap-3 sm:max-w-6xl"
	>
		<Dialog.Header class="sr-only">
			<Dialog.Title>Review draw.io conversion</Dialog.Title>
			<Dialog.Description>
				Review the editable conversion before accepting it into this note.
			</Dialog.Description>
		</Dialog.Header>
		{#if open}
			<DrawioEmbed
				xml={suggestion.payload.source}
				title={suggestion.payload.title ?? 'Converted diagram'}
				commitLabel="Accept diagram"
				commitReason="review"
				oncommit={accept}
				onclose={() => (open = false)}
				onmodifiedchange={(value) => (modified = value)}
			/>
		{/if}
	</Dialog.Content>
</Dialog.Root>
