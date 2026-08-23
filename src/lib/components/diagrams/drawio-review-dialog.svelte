<script lang="ts">
	import type { DiagramSuggestion } from '$lib/models/diagrams';
	import * as Dialog from '$lib/components/ui/dialog';
	import DrawioEmbed, { type DrawioControl, type DrawioStatus } from './drawio-embed.svelte';
	import DiagramStatus from './workspace/diagram-status.svelte';
	import { Button } from '$lib/components/ui/button';
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
	let control = $state<DrawioControl | undefined>(undefined);
	let editor = $state<DrawioStatus>({ phase: 'loading', modified: false });
	const busy = $derived(editor.phase === 'exporting' || editor.phase === 'saving');
	const title = $derived(suggestion.payload.title ?? 'Converted diagram');

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
		<!--
			The dialog's own header, rather than a second one drawn inside the editor:
			the title belongs to the dialog, and printing it in both put it on screen
			twice.
		-->
		<Dialog.Header class="flex-row items-center gap-2 space-y-0">
			<div class="min-w-0 flex-1">
				<Dialog.Title class="truncate text-sm font-medium">{title}</Dialog.Title>
				<Dialog.Description class="sr-only">
					Review the editable conversion before accepting it into this note.
				</Dialog.Description>
			</div>
			<DiagramStatus status={editor} onretry={() => control?.retry()} />
			<Button variant="ghost" size="sm" onclick={() => changeOpen(false)}>Close</Button>
			<Button size="sm" disabled={busy} onclick={() => control?.commit()}>Accept diagram</Button>
		</Dialog.Header>
		{#if open}
			<DrawioEmbed
				xml={suggestion.payload.source}
				{title}
				commitReason="review"
				oncommit={accept}
				onclose={() => (open = false)}
				onmodifiedchange={(value) => (modified = value)}
				oncontrol={(value) => (control = value)}
				onstatus={(value) => (editor = value)}
			/>
		{/if}
	</Dialog.Content>
</Dialog.Root>
