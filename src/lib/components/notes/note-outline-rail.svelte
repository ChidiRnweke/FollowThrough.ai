<script lang="ts">
	import { sectionNumbersFor, type OutlineHeading } from '$lib/models/notes';
	import { Button } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils.js';

	let {
		headings,
		activeId,
		numbered = false,
		onpick
	}: {
		headings: readonly OutlineHeading[];
		activeId?: string;
		/** Mirrors the document: when section numbering is on, the rail numbers too. */
		numbered?: boolean;
		onpick: (id: string) => void;
	} = $props();

	// A rail with a single tick is noise: it tells the reader nothing they cannot
	// see, and still costs the gutter.
	const shown = $derived(headings.length > 1 ? headings : []);
	const numbers = $derived(
		numbered ? sectionNumbersFor(shown.map((heading) => heading.level)) : []
	);

	// Depth reads as indent. Written out as literal utilities rather than computed
	// so the values stay on the spacing scale and Tailwind can see them.
	const INDENT_BY_LEVEL = ['pl-2', 'pl-5', 'pl-8', 'pl-11', 'pl-14', 'pl-17'] as const;

	// One tab stop for the whole rail, then arrows move within it — the roving
	// pattern, so a long outline never becomes a tab trap.
	let focusIndex = $state(0);
	const activeIndex = $derived(shown.findIndex((heading) => heading.id === activeId));

	// Follow the reader while they are not driving the list themselves.
	$effect(() => {
		if (activeIndex >= 0) focusIndex = activeIndex;
	});

	let list = $state<HTMLUListElement | null>(null);

	const moveTo = (index: number) => {
		focusIndex = Math.min(Math.max(index, 0), shown.length - 1);
		list?.querySelectorAll<HTMLButtonElement>('button')[focusIndex]?.focus();
	};

	const onkeydown = (event: KeyboardEvent, index: number) => {
		if (event.key === 'ArrowDown') moveTo(index + 1);
		else if (event.key === 'ArrowUp') moveTo(index - 1);
		else if (event.key === 'Home') moveTo(0);
		else if (event.key === 'End') moveTo(shown.length - 1);
		else if (event.key === 'Escape') {
			if (event.currentTarget instanceof HTMLElement) event.currentTarget.blur();
		} else return;
		event.preventDefault();
	};
</script>

{#if shown.length > 0}
	<!-- Sticky host, zero height: the rail is pinned beside the column without
	     taking a row in it. Geometry and the width at which it hides live in
	     layout.css with the rest of the pane rules. -->
	<div class="note-outline" role="navigation" aria-label="Table of contents">
		<div class="note-outline-rail">
			<!-- The resting state: depth as width, nothing else. Decorative, because
			     every heading it stands for is a real button in the list below. -->
			<ul class="note-outline-ticks" aria-hidden="true">
				{#each shown as heading (heading.id)}
					<li data-level={heading.level} data-active={heading.id === activeId}></li>
				{/each}
			</ul>

			<ul class="note-outline-list" bind:this={list}>
				{#each shown as heading, index (heading.id)}
					<li>
						<!-- The lift and the pill radius are neutralised deliberately: this is a
						     dense list of rows, and a row that rises on hover reads as a card. -->
						<Button
							variant="ghost"
							class={cn(
								'h-auto w-full justify-start gap-1.5 rounded-sm py-1 pr-2 text-left font-normal',
								'text-muted-foreground hover:translate-y-0',
								INDENT_BY_LEVEL[heading.level - 1] ?? 'pl-2',
								heading.id === activeId && 'text-foreground font-medium'
							)}
							tabindex={index === focusIndex ? 0 : -1}
							aria-current={heading.id === activeId ? 'location' : undefined}
							onclick={() => onpick(heading.id)}
							onkeydown={(event: KeyboardEvent) => onkeydown(event, index)}
						>
							{#if numbered}
								<span class="shrink-0 tabular-nums">{numbers[index]}</span>
							{/if}
							<span class="truncate">{heading.text}</span>
						</Button>
					</li>
				{/each}
			</ul>
		</div>
	</div>
{/if}
