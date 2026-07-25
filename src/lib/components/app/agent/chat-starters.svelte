<script lang="ts">
	import { page } from '$app/state';
	import {
		FtArrowRight as ArrowRight,
		FtDocument as Document,
		FtMemory as Memory,
		FtTodos as Todos
	} from '$lib/components/icons';
	import { chatStarters, starterSurface, type StarterTarget } from './chat-starters';

	let {
		hasNote,
		hasProject,
		onpick
	}: {
		hasNote: boolean;
		hasProject: boolean;
		onpick: (prompt: string) => void;
	} = $props();

	const surface = $derived(starterSurface({ hasNote, hasProject, pathname: page.url.pathname }));
	const prompts = $derived(chatStarters(surface));

	// Deliberately the same three icons the capability row above counts, so a row
	// and a stat that mean the same thing look the same.
	const icons: Record<StarterTarget, typeof Memory> = {
		notes: Document,
		todos: Todos,
		memory: Memory
	};
</script>

<!--
	The one group in an empty panel you are meant to act on, so it leads: an
	instruction above it rather than a description, rows at full foreground colour,
	and a tinted icon per row naming what the agent will change. The tint is the
	only colour in the group and it is doing work — it separates three actions from
	the plain history rows below, which is what the earlier all-grey list could not
	do. The heading still sits a step under `section-title`, which the type ladder
	reserves for the context sentence above.

	Weight is spent once, on that heading. The rows carry none: with the panel's
	orientation sentence already at semibold, bolding three rows under it left the
	whole group shouting and nothing standing out. Colour and the icons do the
	work instead.

	No box around the group: a card here would put a second surface inside a panel
	that already is one, and grouping is spacing and similarity by house rule.
-->
<div class="flex flex-col gap-2">
	<p class="px-2 text-sm font-semibold">Ask it to do something</p>
	<ul class="flex flex-col gap-0.5">
		{#each prompts as starter (starter.prompt)}
			{@const Icon = icons[starter.target]}
			<li class="group">
				<!--
					The lift is pure CSS on purpose. `PrefersReducedMotion` exists only
					because Svelte's JS transitions escape the global reduced-motion guard
					in layout.css; a CSS transition is already covered by it.
				-->
				<button
					type="button"
					class="row-interactive flex min-h-11 w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm hover:-translate-y-px hover:shadow-sm focus-visible:-translate-y-px"
					onclick={() => onpick(starter.prompt)}
				>
					<span
						class="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand transition-colors duration-(--duration-micro) group-hover:bg-brand/20 dark:bg-brand/15"
					>
						<Icon class="size-3.5" />
					</span>
					<span class="min-w-0 flex-1">{starter.prompt}</span>
					<!--
						Visible at rest, unlike the history rows: an affordance you have to
						hover to discover leaves the row reading as a sentence, and these are
						the panel's targets.
					-->
					<ArrowRight
						class="size-3.5 shrink-0 text-muted-foreground opacity-60 transition-[color,opacity] duration-(--duration-micro) group-hover:text-brand group-hover:opacity-100 group-focus-within:opacity-100"
					/>
				</button>
			</li>
		{/each}
	</ul>
</div>
