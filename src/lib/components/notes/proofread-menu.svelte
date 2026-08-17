<script lang="ts">
	import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';
	import type { ProofreadSelection } from '$lib/components/edra/commands/Proofread.js';
	import type { Editor } from '$lib/components/edra/commands/CoreEditor.js';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';

	/**
	 * The fixes offered for one flagged word.
	 *
	 * Positioned here rather than through the editor's `BubbleMenu`: that one only
	 * re-evaluates when the selection or the document changes, and clicking an
	 * underline changes neither — it is a click on a decoration, with the caret
	 * left where it was. Floating UI is already a dependency, and `autoUpdate`
	 * keeps the menu on its word through the pane's own scrolling.
	 */
	let {
		editor,
		selection,
		word,
		onapply,
		onlearn
	}: {
		editor: Editor;
		selection: ProofreadSelection;
		/** The dictionary entry this issue would teach, when it is one. */
		word?: string;
		onapply: (replacement: string) => void;
		onlearn: () => void;
	} = $props();

	let menu: HTMLDivElement | undefined = $state();

	$effect(() => {
		const element = menu;
		if (!element) return;
		// Mounted on <body>: inside the editor the menu is clipped by the pane's
		// scroll viewport as soon as the flagged word sits near an edge.
		window.document.body.append(element);
		const anchor = {
			getBoundingClientRect: () => {
				const start = editor.view.coordsAtPos(selection.from);
				const end = editor.view.coordsAtPos(selection.to);
				const left = Math.min(start.left, end.left);
				const top = Math.min(start.top, end.top);
				return new DOMRect(left, top, Math.max(end.right, start.right) - left, end.bottom - top);
			}
		};
		const place = () => {
			void computePosition(anchor, element, {
				strategy: 'fixed',
				placement: 'bottom-start',
				middleware: [offset(6), flip(), shift({ padding: 8 })]
			}).then(({ x, y }) => {
				element.style.left = `${x}px`;
				element.style.top = `${y}px`;
			});
		};
		const stop = autoUpdate(anchor, element, place);
		return () => {
			stop();
			element.remove();
		};
	});
</script>

<div
	bind:this={menu}
	role="dialog"
	aria-label="Spelling and grammar suggestions"
	class="fixed top-0 left-0 z-30 flex max-w-xs flex-col gap-2 rounded-lg border border-border bg-popover p-2"
>
	<p class="px-1 text-xs text-muted-foreground">{selection.issue.message}</p>
	{#if selection.issue.suggestions.length > 0}
		<div class="flex flex-col items-stretch">
			{#each selection.issue.suggestions.slice(0, 5) as suggestion (suggestion.label)}
				<Button
					variant="ghost"
					size="sm"
					class="justify-start font-normal"
					onclick={() => onapply(suggestion.replacement)}
				>
					{suggestion.label}
				</Button>
			{/each}
		</div>
	{/if}
	{#if word}
		{#if selection.issue.suggestions.length > 0}
			<Separator />
		{/if}
		<Button variant="ghost" size="sm" class="justify-start font-normal" onclick={onlearn}>
			Add “{word}” to dictionary
		</Button>
	{/if}
</div>
